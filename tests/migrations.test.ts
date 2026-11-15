import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, describe, it } from 'node:test';
import { initDatabase, db as singletonDb, withTransaction } from '../server/db/database.ts';
import {
  MIGRATIONS,
  getMigrationStatus,
  hashApiToken,
  maskApiToken,
  runMigrations,
} from '../server/db/migrations.ts';

const tempDirs: string[] = [];

function createTempDbPath(filename: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'climato-mig-test-'));
  tempDirs.push(dir);
  return path.join(dir, filename);
}

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Database Migrations & Schema Integrity', () => {
  it('applies all versioned migrations cleanly on a fresh SQLite database', () => {
    const dbPath = createTempDbPath('fresh.db');
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');

    const result = runMigrations(db);
    assert.equal(result.applied.length, MIGRATIONS.length);
    assert.equal(result.totalApplied, MIGRATIONS.length);
    assert.equal(result.currentVersion, MIGRATIONS.length);

    const status = getMigrationStatus(db);
    assert.equal(status.currentVersion, MIGRATIONS.length);
    assert.equal(status.latestAvailableVersion, MIGRATIONS.length);
    assert.equal(status.pendingCount, 0);

    // Verify expected tables exist across v1..v6
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));

    for (const expected of [
      'schema_migrations',
      'organizations',
      'users',
      'workspace_memberships',
      'user_sessions',
      'workspaces',
      'aoi_locations',
      'satellite_connectors',
      'sample_observations',
      'trend_alerts',
      'alert_evaluations',
      'webhook_endpoints',
      'webhook_deliveries',
      'report_requests',
      'demo_requests',
      'api_keys',
      'api_usage_logs',
      'audit_logs',
      'study_regions',
      'scientific_datasets',
      'pipeline_runs',
      'scientific_observations',
      'research_sources',
      'trend_analysis_cache',
    ]) {
      assert.ok(tableNames.has(expected), `Expected table '${expected}' to exist`);
    }

    // Verify indexes exist
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;
    const indexNames = new Set(indexes.map((i) => i.name));
    assert.ok(indexNames.has('idx_api_keys_token_hash'));
    assert.ok(indexNames.has('idx_aoi_workspace'));
    assert.ok(indexNames.has('idx_alerts_workspace'));
    assert.ok(indexNames.has('idx_reports_workspace'));
    assert.ok(indexNames.has('idx_sessions_user'));
    assert.ok(indexNames.has('idx_webhook_deliveries_ws'));
    assert.ok(indexNames.has('idx_alert_eval_alert_time'));
    assert.ok(indexNames.has('idx_usage_org_created'));

    db.close();
  });

  it('is strictly idempotent when runMigrations is invoked multiple times', () => {
    const dbPath = createTempDbPath('idempotent.db');
    const db = new DatabaseSync(dbPath);

    const first = runMigrations(db);
    assert.equal(first.applied.length, MIGRATIONS.length);

    const second = runMigrations(db);
    assert.equal(second.applied.length, 0);
    assert.equal(second.totalApplied, MIGRATIONS.length);
    assert.equal(second.currentVersion, MIGRATIONS.length);

    db.close();
  });

  it('migrates legacy v1 api_keys plaintext tokens to SHA-256 hashes and upgrades cleanly to latest', () => {
    const dbPath = createTempDbPath('legacy-upgrade.db');
    const db = new DatabaseSync(dbPath);

    // Simulate a legacy v1 schema before migration 002
    db.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    MIGRATIONS[0].up(db);
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      1,
      '001_initial_schema',
      '2026-01-01T00:00:00.000Z'
    );

    const legacyRawToken = 'clm_sbx_legacy_secret_99887766aabb';
    db.prepare(`
      INSERT INTO api_keys (id, label, token_value, environment, scopes, rate_limit_rpm, last_used_at, created_at)
      VALUES (?, ?, ?, 'sandbox', 'modules:read', 60, NULL, ?)
    `).run('key-legacy-1', 'Legacy Key', legacyRawToken, '2026-01-01T00:00:00.000Z');

    // Run pending migrations 002..MIGRATIONS.length
    const result = runMigrations(db);
    assert.equal(result.applied.length, MIGRATIONS.length - 1);
    assert.equal(result.currentVersion, MIGRATIONS.length);

    const migratedRow = db
      .prepare('SELECT id, token_value, token_hash, token_prefix, workspace_id, revoked_at FROM api_keys WHERE id = ?')
      .get('key-legacy-1') as {
      id: string;
      token_value: string;
      token_hash: string;
      token_prefix: string;
      workspace_id: string;
      revoked_at: string | null;
    };

    assert.equal(migratedRow.token_hash, hashApiToken(legacyRawToken));
    assert.equal(migratedRow.token_prefix, maskApiToken(legacyRawToken));
    assert.equal(migratedRow.token_value, maskApiToken(legacyRawToken));
    assert.notEqual(migratedRow.token_value, legacyRawToken, 'Plaintext token must not remain in SQLite');
    assert.equal(migratedRow.workspace_id, 'ws-delta-agro');
    assert.equal(migratedRow.revoked_at, null);

    db.close();
  });

  it('safely initializes both a 0-byte empty database file and an absent database file, and rolls back failed transactions', () => {
    const emptyFilePath = createTempDbPath('zero-byte.db');
    fs.writeFileSync(emptyFilePath, '');
    assert.equal(fs.statSync(emptyFilePath).size, 0);

    initDatabase(emptyFilePath);
    const orgsCount = (singletonDb.prepare('SELECT COUNT(*) as cnt FROM organizations').get() as { cnt: number }).cnt;
    assert.ok(orgsCount >= 2);
    const busyTimeout = singletonDb.prepare('PRAGMA busy_timeout').get() as { timeout?: number };
    assert.equal(busyTimeout.timeout, 5000);

    // Verify withTransaction rolls back atomically on failure
    assert.throws(() => {
      withTransaction(() => {
        singletonDb
          .prepare(
            `INSERT INTO audit_logs (id, request_id, actor, action, resource_type, resource_id, metadata, created_at)
             VALUES ('aud-rollback-test', 'req', 'test', 'TEST', 'test', 't1', '{}', '2026-01-01T00:00:00Z')`
          )
          .run();
        throw new Error('Forced rollback');
      });
    }, /Forced rollback/);

    const rolledBackRow = singletonDb
      .prepare("SELECT id FROM audit_logs WHERE id = 'aud-rollback-test'")
      .get();
    assert.equal(rolledBackRow, undefined);

    // Also test absent path initialization
    const absentPath = createTempDbPath('nested/absent.db');
    initDatabase(absentPath);
    assert.ok(fs.existsSync(absentPath));
    const wsCount = (singletonDb.prepare('SELECT COUNT(*) as cnt FROM workspaces').get() as { cnt: number }).cnt;
    assert.ok(wsCount >= 2);
  });

  it('enforces foreign key integrity and nullable alert_evaluations.observed_value', () => {
    const dbPath = createTempDbPath('fk.db');
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
    runMigrations(db);

    assert.throws(() => {
      db.prepare(`
        INSERT INTO aoi_locations (id, workspace_id, name_en, name_ar, lat, lon, radius_km, region_code, primary_module)
        VALUES ('aoi-orphan', 'ws-does-not-exist', 'Orphan', 'يتيم', 30.0, 31.0, 10, 'EG', 'delta-risk')
      `).run();
    }, /FOREIGN KEY constraint failed/);

    // Verify alert_evaluations allows NULL observed_value for INSUFFICIENT_DATA audits
    db.prepare(`
      INSERT INTO workspaces (id, name_en, name_ar, sector, plan_tier, aoi_limit, owner_role_en, owner_role_ar, active_modules, created_at)
      VALUES ('ws-delta-agro', 'Delta Agro', 'الدلتا', 'Agriculture', 'Sector Pro', 25, 'Admin', 'مدير', 'delta-risk', '2026-01-01T00:00:00Z')
    `).run();
    db.prepare(`
      INSERT INTO trend_alerts (
        id, workspace_id, title_en, title_ar, module_id, lat, lon, radius_km,
        metric_key, operator, threshold_value, unit, severity, channel, enabled, last_evaluated_at, created_at
      ) VALUES (
        'alt-test-null', 'ws-delta-agro', 'Test', 'اختبار', 'delta-risk', 31.4, 30.4, 15,
        'coastal_elevation_anomaly_mm', '>', 40, 'mm', 'High', 'Webhook', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
      )
    `).run();
    db.prepare(`
      INSERT INTO alert_evaluations (
        id, alert_id, matched_aoi_id, observed_value, threshold_value, breached, evaluation_status, webhook_signature, delivery_status, evaluated_at
      ) VALUES ('eval-null-1', 'alt-test-null', NULL, NULL, 40, 0, 'INSUFFICIENT_DATA', 'sha256=test', 'INSUFFICIENT_DATA_NO_DISPATCH', '2026-01-01T00:00:00Z')
    `).run();

    const ev = db
      .prepare("SELECT observed_value, evaluation_status FROM alert_evaluations WHERE id = 'eval-null-1'")
      .get() as { observed_value: number | null; evaluation_status: string };
    assert.equal(ev.observed_value, null);
    assert.equal(ev.evaluation_status, 'INSUFFICIENT_DATA');

    db.close();
  });
});
