# CLIMATO Deployment & Operations Guide

## 1. Runtime Requirements

- **Node.js**: `v22.x` (uses built-in `node:sqlite` `DatabaseSync`; verified on `v22.23.2`)
- **Package Manager**: `npm`
- **HTTP Port**: `3000` (bound to `0.0.0.0`, `trust proxy = 1`)
- **Database**: SQLite WAL mode (`./data/terrapulse.db` by default, configurable via `CLIMATO_DB_PATH`)

---

## 2. Installation, Database Initialization & Local Development

Operational SQLite databases (`data/*.db`, `data/*.db-wal`, `data/*.db-shm`) and secrets (`.env*`) are excluded from version control in `.gitignore`. On first startup—whether `terrapulse.db` is absent or an empty 0-byte file—`initDatabase()` automatically:
1. Enables `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = NORMAL`, `PRAGMA foreign_keys = ON`, and `PRAGMA busy_timeout = 5000`.
2. Applies all pending transactional migrations `001..006` recorded in `schema_migrations`.
3. Seeds baseline organizations (`org-nile-agro`, `org-coastal-bank`), workspaces, study regions, NASA dataset definitions, and (only in non-production) the evaluation sandbox API key.

```bash
npm install
cp .env.example .env
npm run dev
```

---

## 3. Build, Type-Check & Automated Verification

```bash
# TypeScript static type-checking
npm run lint

# Automated unit, migration, scientific, security, webhook/report & weather API tests
npm test

# Production Vite frontend bundle
npm run build
```

---

## 4. Production Deployment Checklist

1. **Build frontend assets**: `npm run build`
2. **Configure mandatory production secrets & environment variables**:
   - `NODE_ENV=production`
   - `CLIMATO_ADMIN_SECRET=<32+-char-random-secret>` (mandatory; key/admin routes fail closed if unset)
   - `CLIMATO_WEBHOOK_SECRET=<32+-char-random-secret>` (mandatory; HMAC webhook signing & endpoint encryption fail closed if unset)
   - `CLIMATO_SESSION_KEY=<32+-char-random-secret>`
   - `CORS_ALLOWED_ORIGINS=https://your-production-domain.example`
   - `CLIMATO_DISABLE_DEMO_KEY=true` (also automatic in `NODE_ENV=production`)
   - `CLIMATO_DB_PATH=/var/lib/climato/terrapulse.db` (mount persistent volume)
3. **Optional live satellite credentials**:
   - `NASA_EARTHDATA_TOKEN` (GES DISC / PO.DAAC NetCDF-3 & OPeNDAP retrieval)
   - `NOAA_CDO_TOKEN`, `COPERNICUS_DATA_SPACE_TOKEN`, `USGS_EROS_M2M_TOKEN`
4. **Start production server**:
   ```bash
   NODE_ENV=production npm start
   ```
5. **Bootstrap initial admin/tenant credentials**:
   Register an organization via `POST /api/auth/register` or provision a scoped workspace API key via `POST /api/v1/keys` with `X-Climato-Admin-Secret`.

---

## 5. Database Migrations (`server/db/migrations.ts`)

Each migration runs inside an atomic SQLite transaction (`BEGIN` / `COMMIT` / `ROLLBACK`):
- `001_initial_schema` — Core workspaces, AOIs, alerts, reports, audit logs, and scientific tables
- `002_api_key_hashing_and_tenant_scoping` — `token_hash`, `token_prefix`, `workspace_id`, `revoked_at`, legacy secret scrub
- `003_tenant_and_pipeline_indexes` — Tenant & pipeline indexes
- `004_rbac_orgs_sessions_and_key_lifecycle` — `organizations`, `users`, `workspace_memberships`, `user_sessions`, key `expires_at`/`rotated_from_id`
- `005_alert_null_observed_and_webhooks` — Nullable `alert_evaluations.observed_value`, `evaluation_status`, `webhook_endpoints`, `webhook_deliveries`
- `006_api_usage_metering_and_provenance` — `api_usage_logs`, `pipeline_runs.provenance_checksum` & `ingest_source`, `report_requests.report_payload_json` & `study_region_id`

---

## 6. Operational Caveats

1. Single-node SQLite & in-memory sliding-window RPM rate limiter assume a single Express instance; multi-instance horizontal scaling should migrate database storage to PostgreSQL/PostGIS and rate-limit buckets to Redis.
2. Direct binary NetCDF-4 / HDF5 `.nc4` granules (when OPeNDAP `.ascii` endpoints are unavailable) require external Python/xarray/Harmony workers; Classic NetCDF-3, OPeNDAP ASCII/JSON, and Giovanni/AppEEARS CSV/JSON run natively in Node.js.
