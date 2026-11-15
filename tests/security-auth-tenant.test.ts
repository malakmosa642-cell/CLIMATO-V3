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
    sessionToken?: string;
    adminSecret?: string;
    origin?: string;
    body?: unknown;
  } = {}
) {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  else if (options.sessionToken) headers.Authorization = `Bearer ${options.sessionToken}`;
  if (options.adminSecret) headers['X-Climato-Admin-Secret'] = options.adminSecret;
  if (options.origin) headers.Origin = options.origin;
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

describe('Authentication, RBAC, API Keys, Rate Limiting, Security Headers & Tenant Isolation', () => {
  it('allows public /api/v1/health but rejects unauthenticated /api/v1/* calls with 401', async () => {
    const health = await apiJson('/api/v1/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');
    // Verify Helmet security headers
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(health.headers.get('x-frame-options'));

    const protectedPaths = [
      { method: 'GET', path: '/api/v1/workspaces' },
      { method: 'GET', path: '/api/v1/alerts' },
      { method: 'GET', path: '/api/v1/reports' },
      { method: 'GET', path: '/api/v1/connectors' },
      { method: 'GET', path: '/api/v1/webhooks' },
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

  it('rejects unauthenticated access across all protected /api/* and /api/science/* routes', async () => {
    const protectedPlatformAndScience = [
      { method: 'GET', path: '/api/workspaces' },
      { method: 'POST', path: '/api/aois', body: { nameEn: 'Unauthorized', lat: 30.1, lon: 31.1 } },
      { method: 'GET', path: '/api/alerts' },
      { method: 'POST', path: '/api/alerts', body: { titleEn: 'Unauthorized', moduleId: 'delta-risk' } },
      { method: 'POST', path: '/api/alerts/alt-001/evaluate' },
      { method: 'GET', path: '/api/reports' },
      { method: 'POST', path: '/api/reports', body: { organizationName: 'X', sector: 'Agro', standard: 'ISSB', moduleIds: ['delta-risk'] } },
      { method: 'GET', path: '/api/reports/rep-sample-101/export' },
      { method: 'GET', path: '/api/webhooks' },
      { method: 'POST', path: '/api/webhooks', body: { label: 'Bad', targetUrl: 'https://example.com/hook' } },
      { method: 'GET', path: '/api/admin/overview' },
      { method: 'POST', path: '/api/science/import', body: { datasetId: 'merra-2', regionId: 'nile-delta-north', rawText: 'time,val\n2024-01-01,20' } },
      { method: 'POST', path: '/api/science/pipeline/run', body: { datasetId: 'merra-2', regionId: 'nile-delta-north' } },
      { method: 'POST', path: '/api/science/regions/reset' },
      { method: 'PUT', path: '/api/science/regions/nile-delta-north', body: { centerLat: 31.4 } },
      { method: 'POST', path: '/api/science/probe-sources' },
      { method: 'GET', path: '/api/science/runs' },
    ];

    for (const spec of protectedPlatformAndScience) {
      const res = await apiJson(spec.path, { method: spec.method, body: spec.body });
      assert.ok(
        res.status === 401 || res.status === 403,
        `Expected 401/403 on unauthenticated ${spec.method} ${spec.path}, got ${res.status}`
      );
    }

    // Confirm public non-sensitive read-only endpoints remain accessible cleanly
    const publicOverview = await apiJson('/api/science/overview');
    assert.equal(publicOverview.status, 200);
    const publicObs = await apiJson('/api/observations?limit=5');
    assert.equal(publicObs.status, 200);
    const publicConnectors = await apiJson('/api/connectors');
    assert.equal(publicConnectors.status, 200);
  });

  it('protects key management, audit logs, and demo requests behind CLIMATO_ADMIN_SECRET or admin session', async () => {
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

  it('enforces CORS policy by rejecting disallowed origins cleanly', async () => {
    const evilCors = await apiJson('/api/health', { origin: 'https://evil-attacker.invalid' });
    assert.equal(evilCors.status, 403);
    assert.equal((evilCors.data.error as { code: string }).code, 'CORS_ORIGIN_FORBIDDEN');
  });

  it('supports user/org registration, RBAC roles, brute-force lockout, and cross-organization tenant isolation', async () => {
    // Register Org C
    const regRes = await apiJson('/api/auth/register', {
      method: 'POST',
      body: {
        email: 'admin@orgc-climate.eg',
        fullName: 'Layla El-Masry',
        password: 'StrongPassword#2026!',
        organizationName: 'Org C Agritech',
        sector: 'Agriculture & Exporting',
      },
    });
    assert.equal(regRes.status, 201);
    const orgCToken = regRes.data.token as string;
    assert.ok(orgCToken.startsWith('clm_ses_'));
    const orgCId = (regRes.data.organization as { id: string }).id;

    // Org C can see its own org & workspace
    const orgInfo = await apiJson('/api/auth/org', { sessionToken: orgCToken });
    assert.equal(orgInfo.status, 200);
    const orgCWsId = ((orgInfo.data.workspaces as Array<{ id: string }>)[0]).id;

    // Org C can create an API key inside its own workspace, and sees only Org C keys
    const orgCKeyCreate = await apiJson('/api/v1/keys', {
      method: 'POST',
      sessionToken: orgCToken,
      body: { label: 'Org C Ingestion Key', workspaceId: orgCWsId },
    });
    assert.equal(orgCKeyCreate.status, 201);

    // Org C CANNOT create an API key in ws-delta-agro (Org A) -> 403
    const crossOrgKey = await apiJson('/api/v1/keys', {
      method: 'POST',
      sessionToken: orgCToken,
      body: { label: 'Spoofed Org A Key', workspaceId: 'ws-delta-agro' },
    });
    assert.equal(crossOrgKey.status, 403);
    assert.equal((crossOrgKey.data.error as { code: string }).code, 'TENANT_ISOLATION_VIOLATION');

    // Org C CANNOT evaluate Org A alerts or export Org B reports or call platform admin overview
    const crossEval = await apiJson('/api/alerts/alt-001/evaluate', {
      method: 'POST',
      sessionToken: orgCToken,
    });
    assert.equal(crossEval.status, 403);

    const crossRep = await apiJson('/api/reports/rep-sample-101/export', { sessionToken: orgCToken });
    assert.equal(crossRep.status, 403);

    const adminOverviewAsOrgAdmin = await apiJson('/api/admin/overview', { sessionToken: orgCToken });
    assert.equal(adminOverviewAsOrgAdmin.status, 403);

    const platformOverviewWithSecret = await apiJson('/api/admin/overview', { adminSecret: ADMIN_SECRET });
    assert.equal(platformOverviewWithSecret.status, 200);

    // Add a workspace_member to Org C and verify RBAC restricts org/member mutations
    const addMemberRes = await apiJson('/api/auth/org/members', {
      method: 'POST',
      sessionToken: orgCToken,
      body: {
        email: 'member@orgc-climate.eg',
        fullName: 'Tarek Analyst',
        password: 'MemberPassword#2026!',
        role: 'workspace_member',
      },
    });
    assert.equal(addMemberRes.status, 201);

    const memberLogin = await apiJson('/api/auth/login', {
      method: 'POST',
      body: { email: 'member@orgc-climate.eg', password: 'MemberPassword#2026!' },
    });
    assert.equal(memberLogin.status, 200);
    const memberToken = memberLogin.data.token as string;

    // workspace_member CANNOT add org members or reset study regions (403 INSUFFICIENT_ROLE)
    const memberAddMember = await apiJson('/api/auth/org/members', {
      method: 'POST',
      sessionToken: memberToken,
      body: { email: 'x@y.com', fullName: 'X', password: 'Password12345!' },
    });
    assert.equal(memberAddMember.status, 403);
    assert.equal((memberAddMember.data.error as { code: string }).code, 'INSUFFICIENT_ROLE');

    const memberResetRegions = await apiJson('/api/science/regions/reset', {
      method: 'POST',
      sessionToken: memberToken,
    });
    assert.equal(memberResetRegions.status, 403);

    // Brute-force lockout after 5 wrong login attempts
    for (let i = 0; i < 5; i++) {
      const bad = await apiJson('/api/auth/login', {
        method: 'POST',
        body: { email: 'member@orgc-climate.eg', password: 'WrongPassword!' },
      });
      assert.equal(bad.status, 401);
    }
    const locked = await apiJson('/api/auth/login', {
      method: 'POST',
      body: { email: 'member@orgc-climate.eg', password: 'MemberPassword#2026!' },
    });
    assert.equal(locked.status, 429);
    assert.equal((locked.data.error as { code: string }).code, 'ACCOUNT_LOCKED');
    assert.ok(orgCId);
  });

  it('stores only SHA-256 hashes of API keys, supports rotation & expiration, and revokes keys immediately', async () => {
    const createRes = await apiJson('/api/v1/keys', {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
      body: {
        label: 'Test Agro Key',
        workspaceId: 'ws-delta-agro',
        scopes: ['modules:read', 'alerts:write', 'reports:write', 'geospatial:analyze'],
        expiresInDays: 30,
      },
    });
    assert.equal(createRes.status, 201);

    const createdKey = createRes.data.key as {
      id: string;
      token_value: string;
      token_masked: string;
      workspace_id: string;
      expires_at: string;
    };
    assert.ok(createdKey.token_value.startsWith('clm_sbx_'));
    assert.equal(createdKey.workspace_id, 'ws-delta-agro');
    assert.ok(createdKey.expires_at);

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

    // Rotate key -> old token invalidated immediately, new token active
    const rotateRes = await apiJson(`/api/v1/keys/${createdKey.id}/rotate`, {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
      body: { expiresInDays: 60 },
    });
    assert.equal(rotateRes.status, 201);
    const rotatedKey = rotateRes.data.key as { id: string; token_value: string; rotated_from_id: string };
    assert.equal(rotatedKey.rotated_from_id, createdKey.id);
    assert.notEqual(rotatedKey.token_value, createdKey.token_value);

    const oldAuth = await apiJson('/api/v1/workspaces', { token: createdKey.token_value });
    assert.equal(oldAuth.status, 401);

    const newAuth = await apiJson('/api/v1/workspaces', { token: rotatedKey.token_value });
    assert.equal(newAuth.status, 200);

    // Expired key returns 401 API_KEY_EXPIRED
    db.prepare('UPDATE api_keys SET expires_at = ? WHERE id = ?').run(
      '2020-01-01T00:00:00.000Z',
      rotatedKey.id
    );
    const expiredAuth = await apiJson('/api/v1/workspaces', { token: rotatedKey.token_value });
    assert.equal(expiredAuth.status, 401);
    assert.equal((expiredAuth.data.error as { code: string }).code, 'API_KEY_EXPIRED');

    // Revoke key cleanly
    const revokeRes = await apiJson(`/api/v1/keys/${rotatedKey.id}`, {
      method: 'DELETE',
      adminSecret: ADMIN_SECRET,
    });
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.data.deleted, true);

    // Default sandbox key cannot be deleted
    const delDefault = await apiJson('/api/v1/keys/key-sbx-default', {
      method: 'DELETE',
      adminSecret: ADMIN_SECRET,
    });
    assert.equal(delDefault.status, 400);
  });

  it('enforces API key scopes, sliding-window RPM rate limits, and monthly org quotas', async () => {
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

    const r1 = await apiJson('/api/v1/workspaces', { token });
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get('x-ratelimit-limit'), '2');
    assert.equal(r1.headers.get('x-ratelimit-remaining'), '1');

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

    const r3 = await apiJson('/api/v1/workspaces', { token });
    assert.equal(r3.status, 429);
    assert.equal((r3.data.error as { code: string }).code, 'RATE_LIMIT_EXCEEDED');

    // Verify organization monthly quota enforcement
    const quotaKeyRes = await apiJson('/api/v1/keys', {
      method: 'POST',
      adminSecret: ADMIN_SECRET,
      body: { label: 'Quota Key', workspaceId: 'ws-delta-agro', scopes: ['modules:read'], rateLimitRpm: 100 },
    });
    const quotaToken = (quotaKeyRes.data.key as { token_value: string }).token_value;
    const origQuota = (db.prepare("SELECT monthly_api_quota FROM organizations WHERE id = 'org-nile-agro'").get() as { monthly_api_quota: number }).monthly_api_quota;
    try {
      db.prepare("UPDATE organizations SET monthly_api_quota = 1 WHERE id = 'org-nile-agro'").run();
      const overQuota = await apiJson('/api/v1/workspaces', { token: quotaToken });
      assert.equal(overQuota.status, 429);
      assert.equal((overQuota.data.error as { code: string }).code, 'ORGANIZATION_QUOTA_EXCEEDED');
    } finally {
      db.prepare("UPDATE organizations SET monthly_api_quota = ? WHERE id = 'org-nile-agro'").run(origQuota);
    }
  });

  it('enforces strict workspace tenant isolation and computes exact HMAC signature on genuine alert evaluation', async () => {
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

    const wsA = await apiJson('/api/v1/workspaces', { token: tokenA });
    assert.equal(wsA.status, 200);
    const workspacesA = wsA.data.workspaces as Array<{ id: string }>;
    assert.equal(workspacesA.length, 1);
    assert.equal(workspacesA[0].id, 'ws-delta-agro');

    const alertsB = await apiJson('/api/v1/alerts', { token: tokenB });
    assert.equal(alertsB.status, 200);
    const alertRowsB = alertsB.data.alerts as Array<{ id: string; workspace_id: string }>;
    assert.ok(alertRowsB.length > 0);
    assert.ok(alertRowsB.every((a) => a.workspace_id === 'ws-coastal-banking'));

    const spoofQuery = await apiJson('/api/v1/alerts?workspaceId=ws-coastal-banking', { token: tokenA });
    assert.equal(spoofQuery.status, 403);

    const crossEval = await apiJson('/api/v1/alerts/alt-004/evaluate', {
      method: 'POST',
      token: tokenA,
    });
    assert.equal(crossEval.status, 403);

    const crossReportExport = await apiJson('/api/v1/reports/rep-sample-101/export', { token: tokenA });
    assert.equal(crossReportExport.status, 403);

    const crossAoiModule = await apiJson('/api/v1/modules/air-dust/data?aoiId=aoi-jubail', { token: tokenA });
    assert.equal(crossAoiModule.status, 403);

    // Same-tenant evaluation for alt-001 (aoi-rosetta has real seeded coastal_elevation_anomaly_mm = 46)
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
    assert.equal(evaluation.observedValue, 46);
    assert.equal(evaluation.breached, true);
    assert.match(evaluation.webhookSignatureHeader, /^sha256=[0-9a-f]{64}$/);

    const expectedPayload = JSON.stringify({
      event: 'climato.threshold.breached',
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
