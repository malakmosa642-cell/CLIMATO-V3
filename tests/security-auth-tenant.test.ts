import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../server/app.ts';
import { db, initDatabase } from '../server/db/database.ts';
import { hashApiToken } from '../server/db/migrations.ts';
import { resetRateBucketsForTests } from '../server/middleware/requestContext.ts';

let tempDir: string;
let server: Server;
let baseUrl: string;

const ADMIN_SECRET = 'test-admin-secret-climato-2026';
const WEBHOOK_SECRET = 'test-webhook-hmac-secret-2026';

async function apiJson(
  urlPath: string,
  options: {
    method?: string;
    token?: string;
    adminSecret?: string;
    body?: unknown;
  } = {}
) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.adminSecret) headers['X-Climato-Admin-Secret'] = options.adminSecret;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { raw: text };
  }
  return { status: res.status, headers: res.headers, data };
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'climato-sec-test-'));
  process.env.CLIMATO_ADMIN_SECRET = ADMIN_SECRET;
  process.env.CLIMATO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.NODE_ENV = 'test';
  delete process.env.CLIMATO_DISABLE_DEMO_KEY;

  initDatabase(path.join(tempDir, 'security-test.db'));
  resetRateBucketsForTests();

  const app = await createApp({ enableVite: false, serveStaticDist: false });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('Authentication, API Keys, Rate Limiting, Webhook HMAC & Tenant Isolation', () => {
  it('allows public /api/v1/health but rejects unauthenticated /api/v1/* calls with 401', async () => {
    const health = await apiJson('/api/v1/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');

    const protectedPaths = [
      { method: 'GET', path: '/api/v1/workspaces' },
      { method: 'GET', path: '/api/v1/alerts' },
      { method: 'GET', path: '/api/v1/reports' },
      { method: 'GET', path: '/api/v1/connectors' },
      { method: 'GET', path: '/api/v1/modules/delta-risk/data' },
      { method: 'POST', path: '/api/v1/climate/analyze', body: { lat: 30.044, lon: 31.235 } },
    ];

    for (const reqSpec of protectedPaths) {
      const res = await apiJson(reqSpec.path, { method: reqSpec.method, body: reqSpec.body });
      assert.equal(res.status, 401, `Expected 401 on unauthenticated ${reqSpec.path}`);
      assert.equal((res.data.error as { code: string }).code, 'MISSING_AUTH_TOKEN');
    }

    const malformed = await fetch(`${baseUrl}/api/v1/workspaces`, {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    assert.equal(malformed.status, 401);
  });

  it('protects key management, audit logs, and demo requests behind CLIMATO_ADMIN_SECRET', async () => {
    const noSecret = await apiJson('/api/v1/keys');
    assert.equal(noSecret.status, 403);
    assert.equal((noSecret.data.error as { code: string }).code, 'ADMIN_SECRET_REQUIRED');

    const wrongSecret = await apiJson('/api/v1/keys', { adminSecret: 'wrong-secret' });
    assert.equal(wrongSecret.status, 403);

    const auditNoSecret = await apiJson('/api/audit-logs');
    assert.equal(auditNoSecret.status, 403);

    const demoNoSecret = await apiJson('/api/demo-requests');
    assert.equal(demoNoSecret.status, 403);

    const validSecret = await apiJson('/api/v1/keys', { adminSecret: ADMIN_SECRET });
    assert.equal(validSecret.status, 200);
    assert.equal(validSecret.data.adminSecretConfigured, true);
  });

  it('stores only SHA-256 hashes of API keys, masks listings, and revokes keys immediately', async () => {
    const createRes = await apiJson('/api/v1/keys', {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
      body: {
        label: 'Test Agro Key',
        workspaceId: 'ws-delta-agro',
        scopes: ['modules:read', 'alerts:write', 'reports:write', 'geospatial:analyze'],
      },
    });
    assert.equal(createRes.status, 201);

    const createdKey = createRes.data.key as {
      id: string;
      token_value: string;
      token_masked: string;
      workspace_id: string;
    };
    assert.ok(createdKey.token_value.startsWith('clm_sbx_'));
    assert.equal(createdKey.workspace_id, 'ws-delta-agro');

    // Verify SQLite row never retains raw secret
    const dbRow = db
      .prepare('SELECT token_value, token_hash, token_prefix, revoked_at FROM api_keys WHERE id = ?')
      .get(createdKey.id) as {
      token_value: string;
      token_hash: string;
      token_prefix: string;
      revoked_at: string | null;
    };
    assert.equal(dbRow.token_hash, hashApiToken(createdKey.token_value));
    assert.notEqual(dbRow.token_value, createdKey.token_value);
    assert.ok(dbRow.token_value.includes('****'));
    assert.equal(dbRow.revoked_at, null);

    // Listing endpoint returns masked token only
    const listRes = await apiJson('/api/v1/keys', { adminSecret: ADMIN_SECRET });
    const listed = (listRes.data.keys as Array<{ id: string; token_value: string }>).find(
      (k) => k.id === createdKey.id
    );
    assert.ok(listed);
    assert.notEqual(listed.token_value, createdKey.token_value);
    assert.ok(listed.token_value.includes('****'));

    // Token authenticates successfully before revocation
    const authBefore = await apiJson('/api/v1/workspaces', { token: createdKey.token_value });
    assert.equal(authBefore.status, 200);

    // Revoke key
    const revokeRes = await apiJson(`/api/v1/keys/${createdKey.id}`, {
      method: 'DELETE',
      adminSecret: ADMIN_SECRET,
    });
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.data.deleted, true);

    // Immediate 401 after revocation
    const authAfter = await apiJson('/api/v1/workspaces', { token: createdKey.token_value });
    assert.equal(authAfter.status, 401);
    assert.equal((authAfter.data.error as { code: string }).code, 'INVALID_OR_REVOKED_API_KEY');

    // Default sandbox key cannot be deleted
    const delDefault = await apiJson('/api/v1/keys/key-sbx-default', {
      method: 'DELETE',
      adminSecret: ADMIN_SECRET,
    });
    assert.equal(delDefault.status, 400);
  });

  it('enforces API key scopes and sliding-window per-key rate limits', async () => {
    const readOnlyRes = await apiJson('/api/v1/keys', {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
      body: {
        label: 'ReadOnly RateLimited Key',
        workspaceId: 'ws-delta-agro',
        scopes: ['modules:read'],
        rateLimitRpm: 2,
      },
    });
    assert.equal(readOnlyRes.status, 201);
    const token = (readOnlyRes.data.key as { token_value: string }).token_value;

    // 1st request: allowed endpoint succeeds, rate limit remaining = 1
    const r1 = await apiJson('/api/v1/workspaces', { token });
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('x-ratelimit-limit'), '2');
    assert.equal(r1.headers.get('x-ratelimit-remaining'), '1');

    // 2nd request: disallowed scope returns 403 INSUFFICIENT_SCOPE
    const r2 = await apiJson('/api/v1/reports', {
      method: 'POST',
      token,
      body: {
        organizationName: 'Test Org',
        sector: 'Agriculture & Exporting',
        standard: 'ISSB IFRS S2',
        moduleIds: ['delta-risk'],
      },
    });
    assert.equal(r2.status, 403);
    assert.equal((r2.data.error as { code: string }).code, 'INSUFFICIENT_SCOPE');

    // 3rd request within 60s hits rate limit (429)
    const r3 = await apiJson('/api/v1/workspaces', { token });
    assert.equal(r3.status, 429);
    assert.equal((r3.data.error as { code: string }).code, 'RATE_LIMIT_EXCEEDED');
  });

  it('enforces strict workspace tenant isolation across reads, writes, and cross-tenant resource IDs', async () => {
    const keyARes = await apiJson('/api/v1/keys', {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
      body: {
        label: 'Tenant A Key',
        workspaceId: 'ws-delta-agro',
        scopes: ['modules:read', 'reports:write', 'alerts:write', 'connectors:read'],
      },
    });
    const keyBRes = await apiJson('/api/v1/keys', {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
      body: {
        label: 'Tenant B Key',
        workspaceId: 'ws-coastal-banking',
        scopes: ['modules:read', 'reports:write', 'alerts:write', 'connectors:read'],
      },
    });

    const tokenA = (keyARes.data.key as { token_value: string }).token_value;
    const tokenB = (keyBRes.data.key as { token_value: string }).token_value;

    // Tenant A workspaces listing returns ONLY ws-delta-agro
    const wsA = await apiJson('/api/v1/workspaces', { token: tokenA });
    assert.equal(wsA.status, 200);
    const workspacesA = wsA.data.workspaces as Array<{ id: string }>;
    assert.equal(workspacesA.length, 1);
    assert.equal(workspacesA[0].id, 'ws-delta-agro');

    // Tenant B alerts listing returns ONLY ws-coastal-banking alerts
    const alertsB = await apiJson('/api/v1/alerts', { token: tokenB });
    assert.equal(alertsB.status, 200);
    const alertRowsB = alertsB.data.alerts as Array<{ id: string; workspace_id: string }>;
    assert.ok(alertRowsB.length > 0);
    assert.ok(alertRowsB.every((a) => a.workspace_id === 'ws-coastal-banking'));

    // Cross-tenant query parameter spoofing blocked (403)
    const spoofQuery = await apiJson('/api/v1/alerts?workspaceId=ws-coastal-banking', { token: tokenA });
    assert.equal(spoofQuery.status, 403);
    assert.equal((spoofQuery.data.error as { code: string }).code, 'TENANT_ISOLATION_VIOLATION');

    // Cross-tenant body spoofing blocked on AOI, Alert, and Report creation (403)
    const spoofAoi = await apiJson('/api/v1/aois', {
      method: 'POST',
      token: tokenA,
      body: { workspaceId: 'ws-coastal-banking', nameEn: 'Intrusion AOI', lat: 31.2, lon: 29.9 },
    });
    assert.equal(spoofAoi.status, 403);

    const spoofReport = await apiJson('/api/v1/reports', {
      method: 'POST',
      token: tokenA,
      body: {
        workspaceId: 'ws-coastal-banking',
        organizationName: 'Spoof Corp',
        sector: 'Banking & Real Estate',
        standard: 'ISSB IFRS S2',
        moduleIds: ['delta-risk'],
      },
    });
    assert.equal(spoofReport.status, 403);

    // Cross-tenant resource lookup/action blocked:
    // alt-004 belongs to ws-coastal-banking; rep-sample-101 belongs to ws-coastal-banking; aoi-jubail belongs to ws-coastal-banking
    const crossEval = await apiJson('/api/v1/alerts/alt-004/evaluate', {
      method: 'POST',
      token: tokenA,
    });
    assert.equal(crossEval.status, 403);
    assert.equal((crossEval.data.error as { code: string }).code, 'TENANT_ISOLATION_VIOLATION');

    const crossReportExport = await apiJson('/api/v1/reports/rep-sample-101/export', { token: tokenA });
    assert.equal(crossReportExport.status, 403);

    const crossAoiModule = await apiJson('/api/v1/modules/air-dust/data?aoiId=aoi-jubail', { token: tokenA });
    assert.equal(crossAoiModule.status, 403);

    // Same-tenant evaluation succeeds and produces valid HMAC-SHA256 signature
    const ownEval = await apiJson('/api/v1/alerts/alt-001/evaluate', {
      method: 'POST',
      token: tokenA,
    });
    assert.equal(ownEval.status, 200);
    const evaluation = ownEval.data.evaluation as {
      evaluationId: string;
      alertId: string;
      moduleId: string;
      observedValue: number;
      thresholdValue: number;
      breached: boolean;
      webhookSignatureHeader: string;
      evaluatedAt: string;
    };
    assert.match(evaluation.webhookSignatureHeader, /^sha256=[0-9a-f]{64}$/);

    const expectedPayload = JSON.stringify({
      event: evaluation.breached ? 'climato.threshold.breached' : 'climato.threshold.nominal',
      evaluationId: evaluation.evaluationId,
      alertId: evaluation.alertId,
      moduleId: evaluation.moduleId,
      coordinates: { lat: 31.404, lon: 30.416, radiusKm: 18 },
      observedValue: evaluation.observedValue,
      thresholdValue: evaluation.thresholdValue,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      evaluatedAt: evaluation.evaluatedAt,
    });
    const expectedSig = `sha256=${crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(expectedPayload)
      .digest('hex')}`;
    assert.equal(evaluation.webhookSignatureHeader, expectedSig);
  });

  it('fails closed in production when CLIMATO_ADMIN_SECRET is unset', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.CLIMATO_ADMIN_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.CLIMATO_ADMIN_SECRET;

      const res = await apiJson('/api/v1/keys');
      assert.equal(res.status, 403);
      assert.equal((res.data.error as { code: string }).code, 'KEY_MANAGEMENT_LOCKED');
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.CLIMATO_ADMIN_SECRET = prevSecret;
    }
  });
});
