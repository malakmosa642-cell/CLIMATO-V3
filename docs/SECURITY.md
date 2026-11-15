# CLIMATO Security Architecture & Hardening Guide

## 1. Threat Model & Trust Boundaries

CLIMATO separates traffic across three API surfaces in `server/app.ts`:

1. **`/api/v1/*` (`v1Router`)** — Versioned, multi-tenant external REST API. Protected by Bearer API key authentication, SHA-256 token hashing, scope-based authorization, sliding-window per-key rate limiting, and strict workspace tenant isolation.
2. **`/api/science/*` (`scienceRouter`)** — Scientific Trend Detective pipeline endpoints (Egypt study region configuration, NASA CMR collection discovery, Giovanni/AppEEARS CSV/JSON ingestion, and Mann-Kendall/Theil-Sen execution).
3. **`/api/*` (`platformRouter`)** — First-party UI console endpoints. Sensitive administrative read endpoints (`GET /api/audit-logs`, `GET /api/demo-requests`) are gated behind `requireKeyManagementAuth`.

---

## 2. Authentication & API Key Lifecycle

### 2.1 Fail-Closed Bearer Authentication (`v1AuthAndRateLimit`)
- **Public exception**: Only `GET /api/v1/health` is unauthenticated.
- **Key management exception**: `/api/v1/keys*` delegates to `requireKeyManagementAuth`.
- **All other `/api/v1/*` routes** require `Authorization: Bearer <API_KEY>`:
  - Missing header → `401 MISSING_AUTH_TOKEN`
  - Malformed header → `401 INVALID_AUTH_HEADER`
  - Unknown or revoked key → `401 INVALID_OR_REVOKED_API_KEY`

### 2.2 At-Rest Token Hashing & Single-Display Provisioning
- Raw API tokens (`clm_sbx_<32-hex>`) are generated via `crypto.randomBytes(16)` and returned **once** on `POST /api/v1/keys`.
- SQLite `api_keys` stores **only** the SHA-256 digest (`token_hash`) and a masked display prefix (`token_prefix`, e.g., `clm_sbx_****e0b7`).
- Legacy migration `002_api_key_hashing_and_tenant_scoping` automatically hashes and scrubs any legacy plaintext `token_value` rows.
- `GET /api/v1/keys` returns active (`revoked_at IS NULL`) masked prefixes only.
- `DELETE /api/v1/keys/:id` performs soft revocation by setting `revoked_at`, preserving audit history while immediately rejecting subsequent Bearer requests.

### 2.3 Demo Sandbox Key Production Guardrail
- The default evaluation key (`key-sbx-default`) is seeded **only** in non-production environments when `CLIMATO_DISABLE_DEMO_KEY !== "true"`.
- When `NODE_ENV=production` or `CLIMATO_DISABLE_DEMO_KEY=true`, `initDatabase()` automatically marks `key-sbx-default` revoked.

---

## 3. Admin Secret & Constant-Time Verification

`requireKeyManagementAuth` protects:
- `GET /api/v1/keys`
- `POST /api/v1/keys`
- `DELETE /api/v1/keys/:id`
- `GET /api/audit-logs`
- `GET /api/demo-requests`

Verification rules:
- When `CLIMATO_ADMIN_SECRET` is set, callers must provide `X-Climato-Admin-Secret`. Comparison uses `crypto.timingSafeEqual` (via `constantTimeEqual` in `server/middleware/requestContext.ts`) to mitigate timing side-channels.
- When `NODE_ENV=production` and `CLIMATO_ADMIN_SECRET` is unset, endpoints **fail closed** with `403 KEY_MANAGEMENT_LOCKED`.

---

## 4. Multi-Tenant Isolation & Scope Enforcement

### 4.1 Workspace Binding
- Every API key row in `api_keys` is bound to a `workspace_id` (default `ws-delta-agro`).
- `resolveTenantWorkspaceId()` and `assertTenantRecordOwnership()` enforce tenant boundaries on `/api/v1/*`:
  - Listing endpoints (`GET /api/v1/workspaces`, `GET /api/v1/alerts`, `GET /api/v1/reports`, `GET /api/v1/modules/:moduleId/data`) filter strictly by `workspace_id = apiKeyContext.workspaceId`.
  - Cross-tenant query or body spoofing (`?workspaceId=ws-other` or `{ workspaceId: "ws-other" }`) is rejected with `403 TENANT_ISOLATION_VIOLATION`.
  - Cross-tenant resource access (`POST /api/v1/alerts/:id/evaluate`, `GET /api/v1/alerts/:id/evaluations`, `GET /api/v1/reports/:id/export`, `GET /api/v1/modules/:moduleId/data?aoiId=...`) verifies ownership and returns `403 TENANT_ISOLATION_VIOLATION`.

### 4.2 Scope Checks (`requireScope`)
- `modules:read` — Read workspaces, AOIs, module records, reports, and alert evaluations
- `connectors:read` — Read staged satellite connector registry and coordinate previews
- `geospatial:analyze` — Execute `POST /api/v1/climate/analyze`
- `reports:write` — Create ESG report requests
- `alerts:write` — Create and evaluate geofence alerts
- `audit:read` — Inspect tenant-scoped audit logs

---

## 5. Rate Limiting, Webhook HMAC & Input Validation

- **Rate Limiting**: In-memory 60-second sliding bucket keyed by API key ID (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`). Exceeding `rate_limit_rpm` returns `429 RATE_LIMIT_EXCEEDED`.
- **Webhook Signing**: `evaluateGeofenceAlerts()` signs alert payloads with HMAC-SHA256 (`sha256=<hex>`) using `CLIMATO_WEBHOOK_SECRET`. In `NODE_ENV=production`, missing `CLIMATO_WEBHOOK_SECRET` throws an error (fail closed); in non-production, a per-process `crypto.randomBytes(32)` ephemeral secret is used (zero hardcoded secrets).
- **Input Validation**:
  - Strict WGS84 bounds (`lat ∈ [-90, 90]`, `lon ∈ [-180, 180]`).
  - Egypt study-region bounds enforced on `/api/science/regions/:id` (`Lat 20..34°N`, `Lon 22..38°E`).
  - Alert operators restricted to `>`, `>=`, `<`, `<=`.
  - SQLite queries use parameterized prepared statements (`db.prepare(...).run/get/all`).
  - Foreign key constraints (`PRAGMA foreign_keys = ON`) and explicit workspace existence checks prevent orphan records.

---

## 6. Known Limitations & Hardening Roadmap

- **UI Platform Router (`/api/*`)**: Designed for first-party browser console usage without a separate end-user OAuth/JWT session layer; before multi-organization public SaaS deployment, place `/api/*` behind an identity provider (e.g., OIDC/JWT session middleware) or route console mutations through authenticated tenant tokens.
- **In-Memory Rate Limiter**: Current `rateBuckets` Map is single-instance; horizontal multi-pod deployments should back rate limiting with Redis or an API gateway.
- **SQLite Persistence**: Single-node WAL SQLite (`data/terrapulse.db`); production multi-region deployments should migrate to managed PostgreSQL/PostGIS.
