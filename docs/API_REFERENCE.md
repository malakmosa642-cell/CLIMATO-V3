# CLIMATO Backend API Reference

Base URL: `http://localhost:3000` (or deployed `APP_URL`)

All responses include headers:
- `X-Request-Id`: Unique per-request trace identifier (`req_<hex>`)
- `X-Climato-Engine`: `CLIMATO-Geospatial-Core/2.0`

---

## 1. Versioned Multi-Tenant API (`/api/v1/*`)

### Authentication & Headers
- **Bearer Auth**: Required on all `/api/v1/*` routes except `GET /api/v1/health` and `/api/v1/keys*`.
  `Authorization: Bearer <API_KEY>`
- **Admin Secret**: Required on `/api/v1/keys*` whenever `CLIMATO_ADMIN_SECRET` is configured (and always required in `NODE_ENV=production`).
  `X-Climato-Admin-Secret: <CLIMATO_ADMIN_SECRET>`
- **Response Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-Climato-Data-Provenance`, `X-Climato-Workspace-Id`.

### Health & Keys
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Engine health and data mode check |
| `GET` | `/api/v1/keys` | Admin Secret | List active (`revoked_at IS NULL`) keys with masked prefixes |
| `POST` | `/api/v1/keys` | Admin Secret | Create workspace-scoped key (`{ label, workspaceId, scopes, rateLimitRpm }`); returns raw `token_value` **once** |
| `DELETE` | `/api/v1/keys/:id` | Admin Secret | Soft-revoke API key (`key-sbx-default` protected) |

### Geospatial, Modules, Workspaces, Reports & Alerts (Tenant-Isolated)
| Method | Endpoint | Required Scope | Description |
|---|---|---|---|
| `GET` | `/api/v1/climate/summary?lat=&lon=&connector=` | `connectors:read` | Staged satellite coordinate preview (`SAMPLE_DEMONSTRATION`) |
| `POST` | `/api/v1/climate/analyze` | `geospatial:analyze` | Multi-hazard WGS84 risk profile (`{ lat, lon }`) |
| `GET` | `/api/v1/modules/:moduleId/data` | `modules:read` | Module observations filtered to tenant workspace (`?aoiId=&period=`) |
| `GET` | `/api/v1/connectors` | `connectors:read` | List 11 staged satellite connectors and env status |
| `GET` | `/api/v1/workspaces` | `modules:read` | Get tenant workspace and its AOIs |
| `POST` | `/api/v1/aois` | `modules:read` | Create AOI inside tenant workspace |
| `GET` | `/api/v1/reports` | `modules:read` | List ESG/climate reports in tenant workspace |
| `POST` | `/api/v1/reports` | `reports:write` | Create ESG report request (`organizationName, sector, standard, moduleIds`) |
| `GET` | `/api/v1/reports/:id/export?format=json\|csv` | `modules:read` | Export tenant-owned report in JSON or CSV |
| `GET` | `/api/v1/alerts` | `modules:read` | List geofence alerts in tenant workspace (`?moduleId=`) |
| `POST` | `/api/v1/alerts` | `alerts:write` | Create geofence alert (`titleEn, moduleId, lat, lon, operator, thresholdValue`) |
| `POST` | `/api/v1/alerts/:id/evaluate` | `alerts:write` | Evaluate tenant-owned alert & return HMAC-SHA256 signature |
| `GET` | `/api/v1/alerts/:id/evaluations` | `modules:read` | Get recent evaluations for tenant-owned alert |
| `GET` | `/api/v1/audit-logs` | `audit:read` | Inspect recent tenant-scoped audit log events |

---

## 2. Scientific Trend Detective API (`/api/science/*`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/science/overview` | Returns Egypt study regions, 4 NASA dataset specs, connector token status, 12 research sources, and recent pipeline runs |
| `PUT` | `/api/science/regions/:id` | Update study region bounding box (enforces Egypt bounds `Lat 20..34`, `Lon 22..38`) |
| `POST` | `/api/science/regions/reset` | Reset all 3 Egypt study regions to default coordinates |
| `POST` | `/api/science/probe-sources` | Live HTTP probe of all 4 NASA CMR collections + 12 Research Hub URLs |
| `POST` | `/api/science/pipeline/run` | Run 9-stage pipeline for `{ datasetId, regionId, startDate, endDate, temporalAggregation, mode }` |
| `POST` | `/api/science/import` | Ingest real NASA Giovanni / AppEEARS CSV or JSON series (`{ datasetId, regionId, rawText, format, alreadyNormalized, sourceLabel }`) |
| `GET` | `/api/science/compare?datasetId=&startDate=&endDate=&temporalAggregation=&mode=` | Run regional comparison across Northern Nile Delta, Greater Cairo, and Upper Egypt |
| `GET` | `/api/science/runs` | List latest 30 `pipeline_runs` provenance records |

---

## 3. Platform Console API (`/api/*`)

First-party UI endpoints supporting the bilingual React workspace:
- `GET /api/health`, `GET /api/connectors`, `GET /api/workspaces`, `POST /api/aois`, `POST /api/climate/analyze`, `GET /api/observations`
- `GET /api/alerts`, `POST /api/alerts`, `POST /api/alerts/:id/evaluate`, `GET /api/alerts/:id/evaluations`, `PATCH /api/alerts/:id`, `DELETE /api/alerts/:id`
- `GET /api/reports`, `POST /api/reports`, `GET /api/reports/:id/export`
- `POST /api/demo-requests`
- Admin-protected (`X-Climato-Admin-Secret` / prod fail-closed): `GET /api/audit-logs`, `GET /api/demo-requests`

---

## 4. Standard Error Envelope

```json
{
  "error": {
    "code": "TENANT_ISOLATION_VIOLATION",
    "message": "API key is scoped to workspace 'ws-delta-agro' and cannot access workspace 'ws-coastal-banking'.",
    "requestId": "req_a1b2c3d4e5f6"
  }
}
```
Common error codes: `MISSING_AUTH_TOKEN` (401), `INVALID_AUTH_HEADER` (401), `INVALID_OR_REVOKED_API_KEY` (401), `ADMIN_SECRET_REQUIRED` (403), `KEY_MANAGEMENT_LOCKED` (403), `INSUFFICIENT_SCOPE` (403), `TENANT_ISOLATION_VIOLATION` (403), `RATE_LIMIT_EXCEEDED` (429), `INVALID_COORDINATES` (400), `INVALID_WORKSPACE` (400).
