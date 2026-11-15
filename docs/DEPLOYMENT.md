# CLIMATO Deployment & Operations Guide

## 1. Runtime Requirements

- **Node.js**: `v22.x` (uses built-in `node:sqlite` `DatabaseSync`; verified on `v22.23.2`)
- **Package Manager**: `npm`
- **HTTP Port**: `3000` (bound to `0.0.0.0`)
- **Database**: SQLite WAL mode (`./data/terrapulse.db` by default, configurable via `CLIMATO_DB_PATH`)

---

## 2. Installation & Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

`npm run dev` executes `tsx server.ts`, which:
1. Runs deterministic versioned SQLite migrations (`server/db/migrations.ts` → `schema_migrations`).
2. Seeds baseline study regions, NASA dataset specs, research sources, sample sandbox workspaces, and (in non-production) the SHA-256 hashed evaluation sandbox key.
3. Mounts `/api/science`, `/api/v1`, `/api`, and Vite dev middleware on `http://0.0.0.0:3000`.

---

## 3. Build, Type-Check & Automated Verification

```bash
# TypeScript static type-checking
npm run lint

# Automated unit, migration, scientific, and security integration tests
npm test

# Production Vite frontend bundle
npm run build
```

---

## 4. Production Deployment Checklist

1. **Build frontend assets**:
   ```bash
   npm run build
   ```
2. **Set mandatory production environment variables**:
   - `NODE_ENV=production`
   - `CLIMATO_ADMIN_SECRET=<strong-random-32+-char-secret>` (mandatory; key management & admin audit routes fail closed if unset)
   - `CLIMATO_WEBHOOK_SECRET=<strong-random-32+-char-secret>` (mandatory; alert evaluation HMAC signing fails closed if unset)
   - `CLIMATO_DISABLE_DEMO_KEY=true` (automatic when `NODE_ENV=production`)
   - `CLIMATO_DB_PATH=/var/lib/climato/terrapulse.db` (mount persistent volume; container ephemeral storage will wipe `./data/` on restart)
3. **Optional live satellite provider credentials**:
   - `NASA_EARTHDATA_TOKEN` (GES DISC / PO.DAAC / AppEEARS)
   - `NOAA_CDO_TOKEN` (NOAA surface weather station validation)
   - `COPERNICUS_DATA_SPACE_TOKEN`, `USGS_EROS_M2M_TOKEN`
4. **Start production server**:
   ```bash
   NODE_ENV=production npm start
   ```
5. **Provision first tenant API key**:
   ```bash
   curl -X POST http://localhost:3000/api/v1/keys \
     -H "Content-Type: application/json" \
     -H "X-Climato-Admin-Secret: $CLIMATO_ADMIN_SECRET" \
     -d '{"label":"Production Tenant Key","workspaceId":"ws-delta-agro","scopes":["modules:read","reports:write","alerts:write","connectors:read","geospatial:analyze"]}'
   ```
   Save the returned `token_value` immediately—it is displayed once and only its SHA-256 digest is stored.

---

## 5. Database Migrations

Migrations execute automatically on boot via `initDatabase()` inside `server.ts`:
- `001_initial_schema` — Core platform & scientific tables
- `002_api_key_hashing_and_tenant_scoping` — `token_hash`, `token_prefix`, `workspace_id`, `revoked_at`, legacy secret scrub
- `003_tenant_and_pipeline_indexes` — Composite and workspace isolation indexes

Each migration runs inside an explicit SQLite transaction (`BEGIN` / `COMMIT` / `ROLLBACK`) and records its version in `schema_migrations`.

---

## 6. Production-Readiness Caveats

Before serving untrusted multi-organization SaaS traffic in production:
1. Place first-party UI routes (`/api/*` and `/api/science/*`) behind user session / OIDC authentication (`platformRouter` currently serves the interactive browser demo without a separate user login layer).
2. Migrate SQLite + in-memory `rateBuckets` to PostgreSQL/PostGIS + Redis if scaling horizontally across multiple instances.
3. Attach external Python/xarray OPeNDAP/Harmony workers for automated NetCDF4/HDF5 binary granule extraction (currently CSV/JSON ingestion via Giovanni/AppEEARS and live CMR discovery are operational).
