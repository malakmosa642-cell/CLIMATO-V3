# CLIMATO Data Provenance & Attribution Policy

CLIMATO enforces strict separation and explicit labeling between **real scientific Earth observation data** and **platform demonstration / sandbox data**. Every API response and database record carries explicit provenance metadata.

---

## 1. Provenance Classifications

| Provenance Tag | Meaning | Where Used | Statistical Significance Allowed? |
|---|---|---|---|
| `LIVE_NASA_EARTHDATA` | Metadata discovered via live NASA CMR API and real granules downloaded + parsed (NetCDF-3 / OPeNDAP ASCII / JSON) using `NASA_EARTHDATA_TOKEN` with SHA-256 checksum | `acquireNasaDatasetForRegion()` -> `/api/science/pipeline/run` | Yes, only when `valid >= 10` and `coverage >= 70%` |
| `IMPORTED_OBSERVATIONS` | Real exported CSV/JSON time series uploaded from **NASA Giovanni** or **NASA AppEEARS** (with strict non-empty, date, numeric, coordinate, and duplicate checks) | `POST /api/science/import` -> `scientific_observations` | Yes, only when `valid >= 10` and `coverage >= 70%` |
| `METHODOLOGICAL_TEST_FIXTURE` | Explicitly tagged synthetic step fixtures strictly isolated from real observations (`is_real_observation = 0`) | Offline algorithm unit verification | Never merged into `LIVE_NASA_EARTHDATA` or `IMPORTED_OBSERVATIONS` queries |
| `PENDING_CONFIGURATION` | Live NASA CMR collection/granules verified reachable, while `NASA_EARTHDATA_TOKEN` is absent (`BLOCKED_BY_CREDENTIALS`) or upstream returned auth/error | `/api/science/pipeline/run` without credentials | **No** (`INSUFFICIENT_DATA` — zero observations fabricated) |
| `SAMPLE_DEMONSTRATION` | Seeded sandbox geofence baselines for platform demonstration workflows | `/api/observations`, `/api/v1/modules/:id/data`, `/api/climate/analyze` (`mode="DEMONSTRATION_SAMPLE"`), sandbox reports | N/A (Always flagged `isSampleData: true`) |
| `INSUFFICIENT_DATA` | No matching real observations inside the queried geofence or study region bounding box | `POST /api/alerts/:id/evaluate`, `/api/science/coordinate-profile`, `/api/v1/climate/analyze` (`mode="SCIENTIFIC"`) | **No** (`observedValue: null`, `deliveryStatus: "INSUFFICIENT_DATA_NO_DISPATCH"`) |

---

## 2. Zero-Fabrication Guardrails

1. **NASA Pipeline (`scientificPipeline.ts`)**: When `NASA_EARTHDATA_TOKEN` is unset, CLIMATO performs live NASA CMR collection & granule discovery and returns `status: "PENDING_CONFIGURATION"`, `blockerCode: "BLOCKED_BY_CREDENTIALS"`, `records: []`, and `trendReport: null` (never writing synthetic rows).
2. **Geofence Alerts (`geospatialEngine.ts`)**: When no observation exists inside the configured alert radius (`haversineKm <= radius_km`), evaluation records `observed_value = NULL`, `breached = 0`, `evaluation_status = 'INSUFFICIENT_DATA'`, and `delivery_status = 'INSUFFICIENT_DATA_NO_DISPATCH'` — dispatches zero webhooks.
3. **Webhook Deliveries (`webhookService.ts`)**: A delivery is marked `SENT` only after a real HTTP `2xx` confirmation; SSRF blocks, network timeouts, and HTTP 4xx/5xx responses after retries are persisted honestly as `FAILED`.
4. **Strict Import Rejection (`nasaEarthdataConnectors.ts`)**: `parseImportedObservationSeries()` rejects empty payloads, missing columns, invalid dates, duplicate timestamps, non-numeric entries, out-of-bounds WGS84 coordinates, and synthetic/fixture labels (`METHODOLOGICAL_TEST_FIXTURE`, `FAKE`, `SYNTHETIC_BENCHMARK`).

---

## 3. Database Provenance & Reproducibility Ledger

- **`pipeline_runs`**: Records `id`, `dataset_id`, `region_id`, `provenance_type`, `status`, deterministic `query_hash`, `provenance_checksum` (SHA-256 of downloaded granules or uploaded CSV/JSON), `ingest_source`, `stage_report_json`, and `diagnostics_json`.
- **`scientific_observations`**: Stores raw & normalized values, units, quality flags, `is_missing`, spatial resolution, and `source_granule_ref`.
- **`report_requests`**: Persists `study_region_id` and deterministic serialized bundle (`report_payload_json`) upon export.
- **`audit_logs`**: Tracks auth, key lifecycle, imports, alert evaluations, webhook configuration, and exports with `request_id`.
