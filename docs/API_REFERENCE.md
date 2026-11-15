# CLIMATO Backend API Reference

Base URL: `http://localhost:3000` (or deployed `APP_URL`)

All `/api` responses include trace and security headers:
- `X-Request-Id`: Unique per-request trace identifier (`req_<hex>`)
- `X-Climato-Engine`: `CLIMATO-Geospatial-Core/2.0`
- Helmet headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`)

---

## 1. Authentication & Organization API (`/api/auth/*`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public (rate-limited) | Register user, create tenant organization (`org_admin`) and default workspace; returns `clm_ses_` token & sets `HttpOnly` cookie |
| `POST` | `/api/auth/login` | Public (lockout-protected) | Authenticate user with scrypt password verification & brute-force lockout protection |
| `POST` | `/api/auth/logout` | Optional session | Revoke active `user_sessions` record and clear cookie |
| `GET` | `/api/auth/me` | Session / Key | Inspect authenticated user, organization, and workspace memberships |
| `GET` | `/api/auth/org` | `org_admin` / `platform_admin` | View organization profile, monthly API usage/quota, workspaces, and members |
| `POST` | `/api/auth/org/members` | `org_admin` / `platform_admin` | Provision additional organization user with workspace memberships |

---

## 2. Versioned Multi-Tenant REST API (`/api/v1/*`)

### Authentication & Quota Headers
- **Bearer Auth**: Required on all `/api/v1/*` routes except `GET /api/v1/health` and `/api/v1/keys*`.
  `Authorization: Bearer <API_KEY>`
- **Key Management Auth**: `/api/v1/keys*` accepts either `X-Climato-Admin-Secret` (fail-closed in `production` when unset) or an authenticated `org_admin` / `platform_admin` session scoped to their own organization.
- **Response Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-Climato-Org-Quota-Limit`, `X-Climato-Org-Quota-Remaining`, `X-Climato-Data-Provenance`, `X-Climato-Workspace-Id`.

### Health & API Key Lifecycle
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Engine health and data mode check |
| `GET` | `/api/v1/keys` | Key Mgmt (`org_admin` / `platform_admin` / Secret) | List active (`revoked_at IS NULL`) org-scoped keys with masked prefixes (`?limit=&offset=`) |
| `POST` | `/api/v1/keys` | Key Mgmt | Create workspace-scoped key (`{ label, workspaceId, scopes, rateLimitRpm, expiresInDays }`); returns raw `token_value` **once** |
| `POST` | `/api/v1/keys/:id/rotate` | Key Mgmt | Atomically revoke old key and issue successor with `rotated_from_id` lineage |
| `DELETE` | `/api/v1/keys/:id` | Key Mgmt | Soft-revoke API key (`key-sbx-default` protected) |

### Geospatial, Modules, Workspaces, Alerts, Webhooks & Reports (Tenant-Isolated)
| Method | Endpoint | Required Scope | Description |
|---|---|---|---|
| `GET` | `/api/v1/climate/summary?lat=&lon=&connector=` | `connectors:read` | Staged satellite coordinate preview (`SAMPLE_DEMONSTRATION`) |
| `POST` | `/api/v1/climate/analyze` | `geospatial:analyze` | Coordinate risk profile (`mode="DEMONSTRATION_SAMPLE"`) or scientific dataset profile (`mode="SCIENTIFIC"`) |
| `GET` | `/api/v1/modules/:moduleId/data` | `modules:read` | Paginated module observations filtered to tenant workspace (`?aoiId=&period=&limit=&offset=`) |
| `GET` | `/api/v1/connectors` | `connectors:read` | List 11 staged satellite connectors and env status |
| `GET` | `/api/v1/workspaces` | `modules:read` | Get tenant workspace and paginated AOIs |
| `POST` | `/api/v1/aois` | `modules:read` | Create AOI inside tenant workspace |
| `GET` | `/api/v1/reports` | `modules:read` | Paginated ESG/climate reports in tenant workspace |
| `POST` | `/api/v1/reports` | `reports:write` | Create ESG report request (`organizationName, sector, standard, moduleIds, lat, lon`) |
| `GET` | `/api/v1/reports/:id/export?format=json\|csv\|pdf` | `modules:read` | Export tenant-owned enriched report in JSON, CSV, or binary `%PDF-1.4` |
| `GET` | `/api/v1/alerts` | `modules:read` | Paginated geofence alerts in tenant workspace (`?moduleId=&limit=&offset=`) |
| `POST` | `/api/v1/alerts` | `alerts:write` | Create geofence alert (`titleEn, moduleId, lat, lon, operator, thresholdValue`) |
| `POST` | `/api/v1/alerts/:id/evaluate` | `alerts:write` | Evaluate tenant-owned alert, dispatch configured HTTPS webhooks on breach, and persist evaluation |
| `GET` | `/api/v1/alerts/:id/evaluations` | `modules:read` | Paginated evaluations for tenant-owned alert |
| `GET` | `/api/v1/webhooks` | `modules:read` | List workspace webhook endpoints with masked `secret_prefix` |
| `POST` | `/api/v1/webhooks` | `alerts:write` | Register SSRF-validated webhook endpoint (`label, targetUrl, workspaceId`); returns `signingSecret` once |
| `GET` | `/api/v1/audit-logs` | `audit:read` | Inspect paginated tenant-scoped audit log events |

---

## 3. Scientific Trend Detective API (`/api/science/*`)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/science/overview` | Public (Read) | Study regions, 4 NASA dataset specs, connector token status, 12 research sources, and recent pipeline runs |
| `GET` | `/api/science/coordinate-profile?lat=&lon=&datasetId=` | Public (Read) | EPSG:4326 scientific coordinate profile from real ingested observations (`INSUFFICIENT_DATA` when none) |
| `GET` | `/api/science/compare` | Public (Read) | Regional comparison across Northern Nile Delta, Greater Cairo, and Upper Egypt |
| `GET` | `/api/science/runs` | Public (Read) | Paginated `pipeline_runs` provenance records |
| `PUT` | `/api/science/regions/:id` | Session (`org_admin` / `platform_admin`) | Update study region bounding box (enforces Egypt bounds `Lat 20..34`, `Lon 22..38`) |
| `POST` | `/api/science/regions/reset` | Session (`org_admin` / `platform_admin`) | Reset all 3 Egypt study regions to default coordinates |
| `POST` | `/api/science/probe-sources` | Authenticated (`workspace_member`+) | Live HTTP probe of all 4 NASA CMR collections + 12 Research Hub URLs |
| `POST` | `/api/science/pipeline/run` | Authenticated (`workspace_member`+) | Run 9-stage pipeline for `{ datasetId, regionId, startDate, endDate, temporalAggregation, mode }` |
| `POST` | `/api/science/import` | Authenticated (`workspace_member`+) | Validate & ingest NASA Giovanni / AppEEARS CSV or JSON series |

---

## 4. Platform Console API (`/api/*`)

- **Public**: `GET /api/health`, `GET /api/weather/current`, `GET /api/weather/forecast`, `GET /api/connectors`, `POST /api/climate/analyze`, `POST /api/demo-requests`.
- **Authenticated & Tenant-Isolated**:
  - `GET /api/workspaces`, `POST /api/aois`, `GET /api/observations`
  - `GET /api/alerts`, `POST /api/alerts`, `POST /api/alerts/:id/evaluate`, `GET /api/alerts/:id/evaluations`, `PATCH /api/alerts/:id`, `DELETE /api/alerts/:id`
  - `GET /api/webhooks`, `POST /api/webhooks`, `POST /api/webhooks/:id/rotate-secret`, `GET /api/webhooks/:id/deliveries`
  - `GET /api/reports`, `POST /api/reports`, `GET /api/reports/:id/export?format=json|csv|pdf`
- **Admin / Platform Protected**:
  - `GET /api/audit-logs`, `GET /api/demo-requests` (`requireKeyManagementAuth`)
  - `GET /api/admin/overview` (`requireRoles('platform_admin')` — `X-Climato-Admin-Secret` or `platform_admin` session)

---

## 5. Standard Error Envelope

```json
{
  "error": {
    "code": "TENANT_ISOLATION_VIOLATION",
    "message": "API key is scoped to workspace 'ws-delta-agro' and cannot access workspace 'ws-coastal-banking'.",
    "requestId": "req_a1b2c3d4e5f6"
  }
}
```
Common codes: `AUTHENTICATION_REQUIRED` (401), `MISSING_AUTH_TOKEN` (401), `INVALID_OR_REVOKED_API_KEY` (401), `API_KEY_EXPIRED` (401), `CORS_ORIGIN_FORBIDDEN` (403), `ADMIN_SECRET_REQUIRED` (403), `KEY_MANAGEMENT_LOCKED` (403), `INSUFFICIENT_ROLE` (403), `INSUFFICIENT_SCOPE` (403), `TENANT_ISOLATION_VIOLATION` (403), `ACCOUNT_LOCKED` (423), `RATE_LIMIT_EXCEEDED` (429), `ORG_MONTHLY_QUOTA_EXCEEDED` (429), `INVALID_COORDINATES` (400), `INVALID_WEBHOOK_URL` (400).
