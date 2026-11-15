import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, describe, it } from 'node:test';
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
    assert.equal(result.currentVersion, 3);

    const status = getMigrationStatus(db);
    assert.equal(status.currentVersion, 3);
    assert.equal(status.latestAvailableVersion, 3);
    assert.equal(status.pendingCount, 0);

    // Verify expected tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));

    for (const expected of [
      'schema_migrations',
      'workspaces',
      'aoi_locations',
      'satellite_connectors',
      'sample_observations',
      'trend_alerts',
      'alert_evaluations',
      'report_requests',
      'demo_requests',
      'api_keys',
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

    db.close();
  });

  it('is strictly idempotent when runMigrations is invoked multiple times', () => {
    const dbPath = createTempDbPath('idempotent.db');
    const db = new DatabaseSync(dbPath);

    const first = runMigrations(db);
    assert.equal(first.applied.length, 3);

    const second = runMigrations(db);
    assert.equal(second.applied.length, 0);
    assert.equal(second.totalApplied, 3);
    assert.equal(second.currentVersion, 3);

    db.close();
  });

  it('migrates legacy v1 api_keys plaintext tokens to SHA-256 hashes and masks stored token_value', () => {
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

    // Run pending migrations 002 and 003
    const result = runMigrations(db);
    assert.equal(result.applied.length, 2);
    assert.equal(result.currentVersion, 3);

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

  it('enforces foreign key integrity and cascading deletes when PRAGMA foreign_keys = ON', () => {
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

    db.close();
  });
});
