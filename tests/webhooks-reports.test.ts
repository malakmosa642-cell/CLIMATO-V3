import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http, { type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../server/app.ts';
import { db, initDatabase } from '../server/db/database.ts';
import { resetRateBucketsForTests } from '../server/middleware/requestContext.ts';
import { assertSafeWebhookUrl } from '../server/services/webhookService.ts';

let tempDir: string;
let appServer: Server;
let baseUrl: string;
let webhookServer: Server;
let webhookBaseUrl: string;
let adminSessionToken: string;

const ADMIN_SECRET = 'test-webhook-report-admin-secret';
const WEBHOOK_SECRET = 'test-webhook-report-hmac-secret';

const receivedDeliveries: Array<{
  headers: http.IncomingHttpHeaders;
  rawBody: string;
}> = [];
let webhookMode: 'ok' | 'fail500' = 'ok';

async function apiReq(
  urlPath: string,
  options: { method?: string; sessionToken?: string; adminSecret?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = {};
  if (options.sessionToken) headers.Authorization = `Bearer ${options.sessionToken}`;
  if (options.adminSecret) headers['X-Climato-Admin-Secret'] = options.adminSecret;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // binary or csv
  }
  return { status: res.status, headers: res.headers, data, text, buf };
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'climato-wh-rep-test-'));
  process.env.CLIMATO_ADMIN_SECRET = ADMIN_SECRET;
  process.env.CLIMATO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.NODE_ENV = 'test';

  initDatabase(path.join(tempDir, 'wh-rep.db'));
  resetRateBucketsForTests();

  webhookServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      receivedDeliveries.push({ headers: req.headers, rawBody });
      if (webhookMode === 'fail500') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      }
    });
  });

  await new Promise<void>((resolve) => {
    webhookServer.listen(0, '127.0.0.1', () => {
      const addr = webhookServer.address() as { port: number };
      webhookBaseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const app = await createApp({ enableVite: false, serveStaticDist: false });
  await new Promise<void>((resolve) => {
    appServer = app.listen(0, '127.0.0.1', () => {
      const addr = appServer.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const reg = await apiReq('/api/auth/register', {
    method: 'POST',
    body: {
      email: 'ops@delta-enterprise.eg',
      fullName: 'Nadia Operations',
      password: 'StrongPassword#2026!',
      organizationName: 'Delta Enterprise Ops',
    },
  });
  assert.equal(reg.status, 201);
  adminSessionToken = reg.data.token as string;
});

after(async () => {
  if (appServer) await new Promise<void>((resolve) => appServer.close(() => resolve()));
  if (webhookServer) await new Promise<void>((resolve) => webhookServer.close(() => resolve()));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('Real HTTP Webhooks, Retries, Honest Insufficient Data Alerts & Rich PDF/CSV/JSON Reports', () => {
  it('evaluates insufficient-data alerts honestly with observedValue=null and dispatches zero webhooks', async () => {
    const startCount = receivedDeliveries.length;

    // Create an alert inside the user's new workspace (which has no matching geofence observation at 27.18, 31.18)
    const createAlert = await apiReq('/api/alerts', {
      method: 'POST',
      sessionToken: adminSessionToken,
      body: {
        titleEn: 'Assiut Thermal Sensor Missing Test',
        moduleId: 'urban-heat',
        lat: 27.18,
        lon: 31.18,
        radiusKm: 5,
        metricKey: 'surface_temp_anomaly_c',
        operator: '>',
        thresholdValue: 3.5,
        unit: '°C',
      },
    });
    assert.equal(createAlert.status, 201);
    const alertId = (createAlert.data.alert as { id: string }).id;

    const evalRes = await apiReq(`/api/alerts/${alertId}/evaluate`, {
      method: 'POST',
      sessionToken: adminSessionToken,
    });
    assert.equal(evalRes.status, 200);
    const ev = evalRes.data.evaluation as {
      evaluationStatus: string;
      observedValue: number | null;
      breached: boolean;
      deliveryStatus: string;
    };
    assert.equal(ev.evaluationStatus, 'INSUFFICIENT_DATA');
    assert.equal(ev.observedValue, null);
    assert.equal(ev.breached, false);
    assert.equal(ev.deliveryStatus, 'INSUFFICIENT_DATA_NO_DISPATCH');
    assert.equal(receivedDeliveries.length, startCount);
  });

  it('dispatches real HTTP POST webhooks with HMAC-SHA256 + timestamp replay protection and rotates secrets', async () => {
    // Register webhook endpoint for ws-delta-agro using ADMIN_SECRET
    const createWh = await apiReq('/api/webhooks', {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
      body: {
        workspaceId: 'ws-delta-agro',
        label: 'Delta Production Webhook',
        targetUrl: `${webhookBaseUrl}/hooks/climato`,
      },
    });
    assert.equal(createWh.status, 201);
    const endpoint = createWh.data.endpoint as { id: string; secret_prefix: string };
    const signingSecret = createWh.data.signingSecret as string;
    assert.ok(signingSecret.startsWith('whsec_'));

    receivedDeliveries.length = 0;
    webhookMode = 'ok';

    // Trigger real breach evaluation on alt-001 (Rosetta 46mm > 40mm)
    const evalRes = await apiReq('/api/alerts/alt-001/evaluate', {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
    });
    assert.equal(evalRes.status, 200);
    const ev = evalRes.data.evaluation as {
      evaluationStatus: string;
      observedValue: number;
      breached: boolean;
      deliveryStatus: string;
    };
    assert.equal(ev.evaluationStatus, 'EVALUATED');
    assert.equal(ev.observedValue, 46);
    assert.equal(ev.breached, true);
    assert.equal(ev.deliveryStatus, 'SENT');
    assert.equal(receivedDeliveries.length, 1);

    const delivery = receivedDeliveries[0];
    const sigV1 = String(delivery.headers['x-climato-signature'] || '');
    const sigV2 = String(delivery.headers['x-climato-signature-v2'] || '');
    const ts = String(delivery.headers['x-climato-timestamp'] || '');
    assert.ok(ts);
    const expectedV1 = `sha256=${crypto
      .createHmac('sha256', signingSecret)
      .update(delivery.rawBody)
      .digest('hex')}`;
    const expectedV2 = `v2=${crypto
      .createHmac('sha256', signingSecret)
      .update(`${ts}.${delivery.rawBody}`)
      .digest('hex')}`;
    assert.equal(sigV1, expectedV1);
    assert.equal(sigV2, expectedV2);

    // Rotate secret and verify next breach delivery uses new secret
    const rot = await apiReq(`/api/webhooks/${endpoint.id}/rotate-secret`, {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
    });
    assert.equal(rot.status, 200);
    const rotatedSecret = rot.data.rawSecret as string;
    assert.notEqual(rotatedSecret, signingSecret);

    receivedDeliveries.length = 0;
    const eval2 = await apiReq('/api/alerts/alt-001/evaluate', {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
    });
    assert.equal(eval2.status, 200);
    assert.equal(receivedDeliveries.length, 1);
    const expectedRotatedSig = `sha256=${crypto
      .createHmac('sha256', rotatedSecret)
      .update(receivedDeliveries[0].rawBody)
      .digest('hex')}`;
    assert.equal(receivedDeliveries[0].headers['x-climato-signature'], expectedRotatedSig);

    // Verify HTTP 500 receiver triggers retries and persists FAILED delivery status (never falsely SENT)
    receivedDeliveries.length = 0;
    webhookMode = 'fail500';
    const evalFail = await apiReq('/api/alerts/alt-001/evaluate', {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
    });
    assert.equal(evalFail.status, 200);
    assert.equal((evalFail.data.evaluation as { deliveryStatus: string }).deliveryStatus, 'FAILED');
    assert.ok(receivedDeliveries.length >= 2, 'Expected webhook dispatcher to retry failed HTTP 500 delivery');
  });

  it('blocks private IP / SSRF webhook destinations outside test localhost override', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevAllow = process.env.CLIMATO_ALLOW_LOCALHOST_WEBHOOKS;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.CLIMATO_ALLOW_LOCALHOST_WEBHOOKS;

      await assert.rejects(
        () => assertSafeWebhookUrl('https://169.254.169.254/latest/meta-data'),
        /blocked private|link-local/i
      );
      await assert.rejects(
        () => assertSafeWebhookUrl('https://127.0.0.1/hook'),
        /blocked private/i
      );
      await assert.rejects(
        () => assertSafeWebhookUrl('http://api.example.com/hook'),
        /HTTPS/i
      );
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevAllow !== undefined) process.env.CLIMATO_ALLOW_LOCALHOST_WEBHOOKS = prevAllow;
    }
  });

  it('generates and exports structured JSON, CSV, and valid %PDF-1.4 ESG & Climate reports', async () => {
    const createRep = await apiReq('/api/reports', {
      method: 'POST',
      sessionToken: adminSessionToken,
      body: {
        organizationName: 'Delta Enterprise Ops',
        sector: 'Agriculture & Exporting',
        standard: 'ISSB IFRS S2',
        moduleIds: ['delta-risk', 'water-monitoring', 'esg-reporting'],
        lat: 31.35,
        lon: 30.80,
        reportType: 'Standard Sandbox Export',
      },
    });
    assert.equal(createRep.status, 201);
    const repId = (createRep.data.report as { id: string }).id;

    // JSON export
    const jsonExp = await apiReq(`/api/reports/${repId}/export?format=json`, {
      sessionToken: adminSessionToken,
    });
    assert.equal(jsonExp.status, 200);
    const exportedReport = jsonExp.data.report as { standard: string };
    const exportedSummary = jsonExp.data.scientificSummary as {
      studyRegion: { id: string } | null;
      limitations: unknown[];
    };
    assert.equal(exportedReport.standard, 'ISSB IFRS S2');
    assert.equal(exportedSummary.studyRegion?.id, 'nile-delta-north');
    assert.ok(Array.isArray(exportedSummary.limitations));

    // CSV export
    const csvExp = await apiReq(`/api/reports/${repId}/export?format=csv`, {
      sessionToken: adminSessionToken,
    });
    assert.equal(csvExp.status, 200);
    assert.match(String(csvExp.headers.get('content-type')), /text\/csv/);
    assert.match(csvExp.text, /report_id,workspace_id,organization,standard,data_provenance/);
    assert.match(csvExp.text, /ISSB IFRS S2/);

    // Valid binary PDF 1.4 export
    const pdfExp = await apiReq(`/api/reports/${repId}/export?format=pdf`, {
      sessionToken: adminSessionToken,
    });
    assert.equal(pdfExp.status, 200);
    assert.match(String(pdfExp.headers.get('content-type')), /application\/pdf/);
    const headerStr = pdfExp.buf.subarray(0, 8).toString('ascii');
    const tailStr = pdfExp.buf.subarray(pdfExp.buf.length - 12).toString('ascii');
    assert.equal(headerStr, '%PDF-1.4');
    assert.ok(tailStr.includes('%%EOF'), 'PDF stream must terminate with %%EOF');
    assert.ok(pdfExp.text.includes('ISSB IFRS S2'));
    assert.ok(pdfExp.text.includes('CLIMATO'));

    // Verify stored payload checksum/column in SQLite
    const storedRow = db
      .prepare('SELECT study_region_id, report_payload_json FROM report_requests WHERE id = ?')
      .get(repId) as { study_region_id: string | null; report_payload_json: string | null };
    assert.equal(storedRow.study_region_id, 'nile-delta-north');
    assert.ok(storedRow.report_payload_json);
  });
});
