# CLIMATO Security Architecture & Hardening Guide

## 1. Threat Model & Trust Boundaries

CLIMATO separates traffic across four mounted Express route groups in `server/app.ts`:

1. **`/api/auth/*` (`authRouter`)** — User registration (`POST /api/auth/register`), login (`POST /api/auth/login`), logout (`POST /api/auth/logout`), current identity (`GET /api/auth/me`), and organization/member management (`GET /api/auth/org`, `POST /api/auth/org/members`).
2. **`/api/v1/*` (`v1Router`)** — Versioned, multi-tenant external REST API protected by Bearer API key authentication (`v1AuthAndRateLimit`), SHA-256 token hashing, scope checks (`requireScope`), sliding-window per-key rate limiting, monthly organization API quotas, and strict workspace tenant isolation.
3. **`/api/science/*` (`scienceRouter`)** — Public catalog read endpoints (`GET /api/science/overview`, `GET /api/science/runs`, `GET /api/science/coordinate-profile`, `GET /api/science/compare`) alongside authenticated, role-gated mutation endpoints (`PUT /api/science/regions/:id`, `POST /api/science/regions/reset`, `POST /api/science/probe-sources`, `POST /api/science/pipeline/run`, `POST /api/science/import`).
4. **`/api/*` (`platformRouter`)** — First-party console API. Public health/reference/intake endpoints (`GET /api/health`, `GET /api/weather/*`, `GET /api/connectors`, `POST /api/climate/analyze`, `POST /api/demo-requests`) coexist with strictly authenticated, tenant-isolated resource routes (`/api/workspaces`, `/api/aois`, `/api/observations`, `/api/alerts*`, `/api/webhooks*`, `/api/reports*`) and admin-restricted telemetry (`GET /api/audit-logs`, `GET /api/demo-requests`, `GET /api/admin/overview`).

---

## 2. Security Middleware & HTTP Hardening

Configured in `server/app.ts` and `server/middleware/requestContext.ts`:

- **Helmet**: Sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, production `Strict-Transport-Security`, and Content-Security-Policy (`connect-src` restricted to `'self'`, Open-Meteo, and NASA CMR).
- **Explicit CORS Policy**: Validates `Origin` against `CORS_ALLOWED_ORIGINS` and `APP_URL` (plus localhost in non-production). Disallowed origins receive structured `403 CORS_ORIGIN_FORBIDDEN`.
- **Proxy & Body Limits**: `app.set('trust proxy', 1)`, `x-powered-by` disabled, `express.json({ limit: '2mb' })`, `express.urlencoded({ extended: false, limit: '256kb' })`.
- **Rate Limiting & Brute-Force Lockout**:
  - `globalApiRateLimiter`: Global IP sliding window (`240 req/min` dev, `180 req/min` prod).
  - `authBruteForceRateLimiter`: Auth/demo-intake protection (`20 req / 15 min` outside tests).
  - Persistent account lockout on `users`: 5 failed login attempts lock login for 15 minutes (`locked_until`, `423 ACCOUNT_LOCKED`).
- **Error Serialization**: `errorMiddleware` suppresses stack traces and internal SQLite error details from HTTP JSON responses.

---

## 3. Authentication, Sessions & Role-Based Access Control (RBAC)

- **Passwords**: Hashed using `crypto.scryptSync` with per-user 16-byte random salt (`scrypt$<salt>$<hash>`) and verified via `crypto.timingSafeEqual`.
- **Sessions**: `clm_ses_<48-hex>` tokens returned on login/registration and also stored in `HttpOnly`, `SameSite=Lax` (plus `Secure` in production) cookies. Only `SHA-256(token)` is persisted in SQLite `user_sessions`.
- **Roles (`requireRoles`)**:
  - `platform_admin` (or verified `X-Climato-Admin-Secret`): Cross-organization administrative telemetry (`GET /api/admin/overview`), platform-wide audit logs, demo requests.
  - `org_admin`: Organization workspace/member/API-key/webhook-secret rotation and science mutation access scoped strictly to `userContext.organizationId`.
  - `workspace_member`: Operational mutations (`POST /api/aois`, `POST /api/alerts`, `POST /api/alerts/:id/evaluate`, `POST /api/webhooks`, `POST /api/reports`) scoped to `workspace_memberships` / organization workspaces.
  - `authenticated_user`: Read access to authorized workspace summaries and report exports.

---

## 4. API Key Lifecycle (`api_keys`)

- **Generation & Hashing**: Tokens (`clm_sbx_<32-hex>`) are generated via `crypto.randomBytes(16)`, displayed **once** in `POST /api/v1/keys` and `POST /api/v1/keys/:id/rotate`, and stored solely as `token_hash` (SHA-256) + masked `token_prefix`. Legacy migration `002` hashes and scrubs any pre-existing plaintext rows.
- **Lifecycle Controls**:
  - Optional expiration (`expiresInDays`, persisted as `expires_at`; expired keys fail with `401 API_KEY_EXPIRED`).
  - Atomic rotation (`POST /api/v1/keys/:id/rotate`) revokes the prior key (`revoked_at`) and records lineage (`rotated_from_id`) inside a SQLite transaction.
  - Soft revocation (`DELETE /api/v1/keys/:id`) sets `revoked_at` and invalidates the token immediately.
- **Production Demo Key Guardrail**: `key-sbx-default` is only seeded in non-production environments and is automatically revoked when `NODE_ENV=production` or `CLIMATO_DISABLE_DEMO_KEY=true`.

---

## 5. Multi-Tenant Isolation & Scope Enforcement

- `assertOrganizationOwnership()`, `resolveTenantWorkspaceId()`, and `assertTenantRecordOwnership()` verify workspace & organization ownership across `/api/*` and `/api/v1/*`. Cross-tenant query spoofing or resource ID probing returns `403 TENANT_ISOLATION_VIOLATION`.
- API keys require explicit scopes (`requireScope`) including `modules:read`, `connectors:read`, `geospatial:analyze`, `reports:write`, `alerts:write`, and `audit:read`.
- Every `/api` and `/api/v1` call meters organization usage in `api_usage_logs` and enforces monthly `organizations.monthly_api_quota` (`429 ORG_MONTHLY_QUOTA_EXCEEDED`).

---

## 6. Webhook Security & SSRF Protection (`webhookService.ts`)

- **Destination Validation (`assertSafeWebhookUrl`)**: Enforces `https:` outside explicit test/local opt-in, rejects `localhost`/`.local`/`.internal` hostnames, inspects literal and DNS-resolved IPv4/IPv6 addresses, and blocks loopback, RFC-1918 private networks, CGNAT/multicast, and `169.254.0.0/16` cloud metadata ranges.
- **Encrypted Secret Storage**: Per-endpoint signing secrets (`whsec_*`) are encrypted at rest with AES-256-GCM (`encv1:<iv>:<tag>:<cipher>`) derived from `CLIMATO_WEBHOOK_SECRET` / `CLIMATO_ADMIN_SECRET`.
- **Signed Delivery & Replay Protection**: Outbound webhook `POST` requests include:
  - `X-Climato-Timestamp`: Unix epoch seconds
  - `X-Climato-Signature`: `sha256=<HMAC-SHA256(secret, rawBody)>`
  - `X-Climato-Signature-V2`: `v2=<HMAC-SHA256(secret, timestamp + "." + rawBody)>`
- **Admin Secret Fail-Closed**: Missing `CLIMATO_ADMIN_SECRET` in `NODE_ENV=production` fails closed (`403 KEY_MANAGEMENT_LOCKED`); missing `CLIMATO_WEBHOOK_SECRET` in `NODE_ENV=production` throws cleanly.
