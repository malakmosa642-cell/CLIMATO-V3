import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface MigrationDefinition {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

export interface AppliedMigrationRow {
  version: number;
  name: string;
  applied_at: string;
}

export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function maskApiToken(token: string): string {
  if (!token || token.length < 12) return '****';
  return `${token.slice(0, 8)}****${token.slice(-4)}`;
}

function tableHasColumn(db: DatabaseSync, tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((c) => c.name === columnName);
}

export const MIGRATIONS: MigrationDefinition[] = [
  {
    version: 1,
    name: '001_initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name_en TEXT NOT NULL,
          name_ar TEXT NOT NULL,
          sector TEXT NOT NULL,
          plan_tier TEXT NOT NULL,
          aoi_limit INTEGER NOT NULL,
          owner_role_en TEXT NOT NULL,
          owner_role_ar TEXT NOT NULL,
          active_modules TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS aoi_locations (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          name_en TEXT NOT NULL,
          name_ar TEXT NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          radius_km REAL NOT NULL,
          region_code TEXT NOT NULL,
          primary_module TEXT NOT NULL,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS satellite_connectors (
          id TEXT PRIMARY KEY,
          source_name TEXT NOT NULL,
          agency TEXT NOT NULL,
          temporal_cadence TEXT NOT NULL,
          spatial_resolution TEXT NOT NULL,
          primary_variables TEXT NOT NULL,
          mapped_modules TEXT NOT NULL,
          integration_stage TEXT NOT NULL,
          data_provenance_status TEXT NOT NULL,
          ingestion_format TEXT NOT NULL,
          required_env_var TEXT NOT NULL,
          endpoint_template TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sample_observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          aoi_id TEXT NOT NULL,
          module_id TEXT NOT NULL,
          source_name TEXT NOT NULL,
          period_label TEXT NOT NULL,
          metric_key TEXT NOT NULL,
          metric_value REAL NOT NULL,
          unit TEXT NOT NULL,
          baseline_value REAL NOT NULL,
          anomaly_delta REAL NOT NULL,
          is_sample_data INTEGER NOT NULL DEFAULT 1,
          data_provenance TEXT NOT NULL DEFAULT 'SAMPLE_DEMONSTRATION',
          FOREIGN KEY (aoi_id) REFERENCES aoi_locations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS trend_alerts (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          title_en TEXT NOT NULL,
          title_ar TEXT NOT NULL,
          module_id TEXT NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          radius_km REAL NOT NULL,
          metric_key TEXT NOT NULL,
          operator TEXT NOT NULL,
          threshold_value REAL NOT NULL,
          unit TEXT NOT NULL,
          severity TEXT NOT NULL,
          channel TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          last_evaluated_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS alert_evaluations (
          id TEXT PRIMARY KEY,
          alert_id TEXT NOT NULL,
          matched_aoi_id TEXT,
          observed_value REAL NOT NULL,
          threshold_value REAL NOT NULL,
          breached INTEGER NOT NULL,
          webhook_signature TEXT NOT NULL,
          delivery_status TEXT NOT NULL,
          evaluated_at TEXT NOT NULL,
          FOREIGN KEY (alert_id) REFERENCES trend_alerts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS report_requests (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          organization_name TEXT NOT NULL,
          sector TEXT NOT NULL,
          standard TEXT NOT NULL,
          module_ids TEXT NOT NULL,
          lat REAL NOT NULL,
          lon REAL NOT NULL,
          report_type TEXT NOT NULL,
          status TEXT NOT NULL,
          data_provenance TEXT NOT NULL DEFAULT 'SAMPLE_DEMONSTRATION',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS demo_requests (
          id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          work_email TEXT NOT NULL,
          organization TEXT NOT NULL,
          sector TEXT NOT NULL,
          plan_interest TEXT NOT NULL,
          modules_interested TEXT NOT NULL,
          notes TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'RECEIVED',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          token_value TEXT NOT NULL,
          environment TEXT NOT NULL DEFAULT 'sandbox',
          scopes TEXT NOT NULL,
          rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
          last_used_at TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          actor TEXT NOT NULL,
          action TEXT NOT NULL,
          resource_type TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          metadata TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS study_regions (
          id TEXT PRIMARY KEY,
          name_en TEXT NOT NULL,
          name_ar TEXT NOT NULL,
          classification_en TEXT NOT NULL,
          classification_ar TEXT NOT NULL,
          center_lat REAL NOT NULL,
          center_lon REAL NOT NULL,
          min_lat REAL NOT NULL,
          max_lat REAL NOT NULL,
          min_lon REAL NOT NULL,
          max_lon REAL NOT NULL,
          approx_area_km2 REAL NOT NULL,
          selection_rationale_en TEXT NOT NULL,
          selection_rationale_ar TEXT NOT NULL,
          primary_stressors_en TEXT NOT NULL,
          primary_stressors_ar TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scientific_datasets (
          id TEXT PRIMARY KEY,
          variable_key TEXT NOT NULL,
          variable_name_en TEXT NOT NULL,
          variable_name_ar TEXT NOT NULL,
          dataset_name TEXT NOT NULL,
          product_id TEXT NOT NULL,
          product_version TEXT NOT NULL,
          target_variable_field TEXT NOT NULL,
          agency TEXT NOT NULL,
          documentation_url TEXT NOT NULL,
          cmr_short_name TEXT NOT NULL,
          cmr_collection_concept_id TEXT NOT NULL,
          access_method TEXT NOT NULL,
          endpoint_template TEXT NOT NULL,
          required_env_var TEXT NOT NULL,
          temporal_resolution TEXT NOT NULL,
          spatial_resolution TEXT NOT NULL,
          native_footprint_km REAL NOT NULL,
          native_unit TEXT NOT NULL,
          normalized_unit TEXT NOT NULL,
          normalization_formula TEXT NOT NULL,
          coverage_period TEXT NOT NULL,
          quality_flags TEXT NOT NULL,
          licensing TEXT NOT NULL,
          scale_limitation_en TEXT NOT NULL,
          scale_limitation_ar TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pipeline_runs (
          id TEXT PRIMARY KEY,
          dataset_id TEXT NOT NULL,
          region_id TEXT NOT NULL,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          temporal_aggregation TEXT NOT NULL,
          provenance_type TEXT NOT NULL,
          status TEXT NOT NULL,
          query_hash TEXT NOT NULL,
          records_ingested INTEGER NOT NULL DEFAULT 0,
          valid_records INTEGER NOT NULL DEFAULT 0,
          missing_periods INTEGER NOT NULL DEFAULT 0,
          stage_report_json TEXT NOT NULL,
          diagnostics_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS scientific_observations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL,
          region_id TEXT NOT NULL,
          dataset_id TEXT NOT NULL,
          variable_key TEXT NOT NULL,
          obs_date TEXT NOT NULL,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          raw_value REAL,
          raw_unit TEXT NOT NULL,
          normalized_value REAL,
          normalized_unit TEXT NOT NULL,
          uncertainty REAL,
          quality_flag TEXT NOT NULL,
          is_missing INTEGER NOT NULL DEFAULT 0,
          native_spatial_resolution TEXT NOT NULL,
          provenance_type TEXT NOT NULL,
          source_granule_ref TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (run_id) REFERENCES pipeline_runs(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS research_sources (
          id TEXT PRIMARY KEY,
          title_en TEXT NOT NULL,
          title_ar TEXT NOT NULL,
          url TEXT NOT NULL,
          organization TEXT NOT NULL,
          classification TEXT NOT NULL,
          description_en TEXT NOT NULL,
          description_ar TEXT NOT NULL,
          relevance_en TEXT NOT NULL,
          relevance_ar TEXT NOT NULL,
          integration_status TEXT NOT NULL,
          last_probe_status INTEGER,
          last_probed_at TEXT,
          probe_note TEXT
        );

        CREATE TABLE IF NOT EXISTS trend_analysis_cache (
          query_hash TEXT PRIMARY KEY,
          dataset_id TEXT NOT NULL,
          region_id TEXT NOT NULL,
          provenance_type TEXT NOT NULL,
          result_json TEXT NOT NULL,
          computed_at TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    name: '002_api_key_hashing_and_tenant_scoping',
    up: (db) => {
      if (!tableHasColumn(db, 'api_keys', 'token_hash')) {
        db.exec(`ALTER TABLE api_keys ADD COLUMN token_hash TEXT;`);
      }
      if (!tableHasColumn(db, 'api_keys', 'token_prefix')) {
        db.exec(`ALTER TABLE api_keys ADD COLUMN token_prefix TEXT;`);
      }
      if (!tableHasColumn(db, 'api_keys', 'workspace_id')) {
        db.exec(`ALTER TABLE api_keys ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'ws-delta-agro';`);
      }
      if (!tableHasColumn(db, 'api_keys', 'revoked_at')) {
        db.exec(`ALTER TABLE api_keys ADD COLUMN revoked_at TEXT;`);
      }

      // Backfill any legacy plaintext rows so raw bearer secrets are never retained at rest
      const rows = db
        .prepare('SELECT id, token_value, token_hash, token_prefix FROM api_keys')
        .all() as Array<{
        id: string;
        token_value: string;
        token_hash: string | null;
        token_prefix: string | null;
      }>;

      const updateStmt = db.prepare(
        'UPDATE api_keys SET token_hash = ?, token_prefix = ?, token_value = ? WHERE id = ?'
      );

      for (const row of rows) {
        if (!row.token_hash && row.token_value && !row.token_value.includes('****')) {
          const masked = maskApiToken(row.token_value);
          updateStmt.run(hashApiToken(row.token_value), masked, masked, row.id);
        } else if (row.token_hash && !row.token_prefix) {
          const masked = maskApiToken(row.token_value);
          updateStmt.run(row.token_hash, masked, masked, row.id);
        }
      }

      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_token_hash
        ON api_keys(token_hash)
        WHERE token_hash IS NOT NULL;
      `);
    },
  },
  {
    version: 3,
    name: '003_tenant_and_pipeline_indexes',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_aoi_workspace ON aoi_locations(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_alerts_workspace ON trend_alerts(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_reports_workspace ON report_requests(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_sci_obs_run_region_ds ON scientific_observations(run_id, region_id, dataset_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_pipeline_runs_query_hash ON pipeline_runs(query_hash);
      `);
    },
  },
  {
    version: 4,
    name: '004_rbac_orgs_sessions_and_key_lifecycle',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          plan_tier TEXT NOT NULL DEFAULT 'Sector Pro',
          monthly_api_quota INTEGER NOT NULL DEFAULT 50000,
          aoi_quota INTEGER NOT NULL DEFAULT 25,
          billing_status TEXT NOT NULL DEFAULT 'SANDBOX_ACTIVE',
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('platform_admin', 'org_admin', 'workspace_member', 'authenticated_user')),
          organization_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
          failed_login_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT,
          created_at TEXT NOT NULL,
          last_login_at TEXT,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workspace_memberships (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('org_admin', 'workspace_member', 'viewer')),
          created_at TEXT NOT NULL,
          UNIQUE(user_id, workspace_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_sessions (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          user_id TEXT NOT NULL,
          organization_id TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          revoked_at TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
        );
      `);

      if (!tableHasColumn(db, 'workspaces', 'organization_id')) {
        db.exec(`ALTER TABLE workspaces ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-climato-demo';`);
      }
      if (!tableHasColumn(db, 'api_keys', 'organization_id')) {
        db.exec(`ALTER TABLE api_keys ADD COLUMN organization_id TEXT NOT NULL DEFAULT 'org-climato-demo';`);
      }
      if (!tableHasColumn(db, 'api_keys', 'expires_at')) {
        db.exec(`ALTER TABLE api_keys ADD COLUMN expires_at TEXT;`);
      }
      if (!tableHasColumn(db, 'api_keys', 'rotated_from_id')) {
        db.exec(`ALTER TABLE api_keys ADD COLUMN rotated_from_id TEXT;`);
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(organization_id);
        CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
        CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at);
      `);
    },
  },
  {
    version: 5,
    name: '005_alert_null_observed_and_webhooks',
    up: (db) => {
      // Rebuild alert_evaluations so observed_value is nullable (NULL for INSUFFICIENT_DATA; never fabricated)
      db.exec(`
        CREATE TABLE IF NOT EXISTS alert_evaluations_v5 (
          id TEXT PRIMARY KEY,
          alert_id TEXT NOT NULL,
          matched_aoi_id TEXT,
          observed_value REAL,
          threshold_value REAL NOT NULL,
          breached INTEGER NOT NULL,
          evaluation_status TEXT NOT NULL DEFAULT 'EVALUATED',
          webhook_signature TEXT NOT NULL,
          webhook_timestamp TEXT,
          delivery_status TEXT NOT NULL,
          evaluated_at TEXT NOT NULL,
          FOREIGN KEY (alert_id) REFERENCES trend_alerts(id) ON DELETE CASCADE
        );

        INSERT INTO alert_evaluations_v5 (
          id, alert_id, matched_aoi_id, observed_value, threshold_value,
          breached, evaluation_status, webhook_signature, delivery_status, evaluated_at
        )
        SELECT
          id, alert_id, matched_aoi_id, observed_value, threshold_value,
          breached, 'EVALUATED', webhook_signature, delivery_status, evaluated_at
        FROM alert_evaluations;

        DROP TABLE alert_evaluations;
        ALTER TABLE alert_evaluations_v5 RENAME TO alert_evaluations;

        CREATE INDEX IF NOT EXISTS idx_alert_eval_alert_time ON alert_evaluations(alert_id, evaluated_at DESC);

        CREATE TABLE IF NOT EXISTS webhook_endpoints (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          organization_id TEXT NOT NULL,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          secret_value TEXT NOT NULL,
          secret_prefix TEXT NOT NULL,
          events TEXT NOT NULL DEFAULT 'climato.threshold.breached',
          enabled INTEGER NOT NULL DEFAULT 1,
          timeout_ms INTEGER NOT NULL DEFAULT 5000,
          max_retries INTEGER NOT NULL DEFAULT 3,
          created_at TEXT NOT NULL,
          rotated_at TEXT,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS webhook_deliveries (
          id TEXT PRIMARY KEY,
          endpoint_id TEXT,
          evaluation_id TEXT,
          alert_id TEXT,
          workspace_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          signature_header TEXT NOT NULL,
          timestamp_header TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'RETRYING')),
          attempt_count INTEGER NOT NULL DEFAULT 0,
          http_status INTEGER,
          error_message TEXT,
          next_retry_at TEXT,
          delivered_at TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints(id) ON DELETE SET NULL,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_ws ON webhook_endpoints(workspace_id, enabled);
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_ws ON webhook_deliveries(workspace_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at);
      `);
    },
  },
  {
    version: 6,
    name: '006_api_usage_metering_and_provenance',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS api_usage_logs (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          actor_type TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          organization_id TEXT,
          workspace_id TEXT,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          latency_ms INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_usage_org_created ON api_usage_logs(organization_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_usage_ws_created ON api_usage_logs(workspace_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_usage_actor ON api_usage_logs(actor_id, created_at DESC);
      `);

      if (!tableHasColumn(db, 'pipeline_runs', 'provenance_checksum')) {
        db.exec(`ALTER TABLE pipeline_runs ADD COLUMN provenance_checksum TEXT;`);
      }
      if (!tableHasColumn(db, 'pipeline_runs', 'ingest_source')) {
        db.exec(`ALTER TABLE pipeline_runs ADD COLUMN ingest_source TEXT;`);
      }
      if (!tableHasColumn(db, 'report_requests', 'report_payload_json')) {
        db.exec(`ALTER TABLE report_requests ADD COLUMN report_payload_json TEXT;`);
      }
      if (!tableHasColumn(db, 'report_requests', 'study_region_id')) {
        db.exec(`ALTER TABLE report_requests ADD COLUMN study_region_id TEXT;`);
      }
    },
  },
];

export function runMigrations(database: DatabaseSync): {
  applied: AppliedMigrationRow[];
  totalApplied: number;
  currentVersion: number;
} {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = database
    .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC')
    .all() as unknown as AppliedMigrationRow[];
  const appliedSet = new Set(appliedRows.map((r) => r.version));

  const newlyApplied: AppliedMigrationRow[] = [];
  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.version)) continue;
    database.exec('BEGIN');
    try {
      migration.up(database);
      const nowIso = new Date().toISOString();
      database
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, nowIso);
      database.exec('COMMIT');
      newlyApplied.push({
        version: migration.version,
        name: migration.name,
        applied_at: nowIso,
      });
    } catch (err) {
      database.exec('ROLLBACK');
      throw err;
    }
  }

  const allApplied = database
    .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC')
    .all() as unknown as AppliedMigrationRow[];
  const currentVersion = allApplied.length > 0 ? allApplied[allApplied.length - 1].version : 0;

  return {
    applied: newlyApplied,
    totalApplied: allApplied.length,
    currentVersion,
  };
}

export function getMigrationStatus(database: DatabaseSync): {
  currentVersion: number;
  latestAvailableVersion: number;
  pendingCount: number;
  migrations: AppliedMigrationRow[];
} {
  const rows = database
    .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC')
    .all() as unknown as AppliedMigrationRow[];
  const currentVersion = rows.length > 0 ? rows[rows.length - 1].version : 0;
  const latestAvailableVersion = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
  return {
    currentVersion,
    latestAvailableVersion,
    pendingCount: Math.max(0, MIGRATIONS.length - rows.length),
    migrations: rows,
  };
}
