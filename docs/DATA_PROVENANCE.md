# CLIMATO Data Provenance & Attribution Policy

CLIMATO enforces strict transparency between **real scientific Earth observation data** and **platform demonstration / sandbox data**. Every API response and database record carries explicit provenance metadata.

---

## 1. Provenance Classifications

| Provenance Tag | Meaning | Where Used | Statistical Significance Allowed? |
|---|---|---|---|
| `LIVE_NASA_EARTHDATA` | Metadata/granules discovered via live NASA CMR API and/or extracted with configured `NASA_EARTHDATA_TOKEN` | `/api/science/probe-sources`, `/api/science/pipeline/run` (when binary extraction/worker active) | Yes, only when `valid >= 10` and `coverage >= 70%` |
| `IMPORTED_OBSERVATIONS` | Real exported CSV/JSON time series uploaded from **NASA Giovanni** or **NASA AppEEARS** | `POST /api/science/import` → `scientific_observations` | Yes, only when `valid >= 10` and `coverage >= 70%` |
| `PENDING_CONFIGURATION` | Live NASA CMR collection/granules verified reachable, but `NASA_EARTHDATA_TOKEN` or OPeNDAP/Harmony binary worker is not configured | `/api/science/pipeline/run` without token or series | **No** (`INSUFFICIENT_DATA` — zero values fabricated) |
| `SAMPLE_DEMONSTRATION` | Deterministic geospatial baseline & seeded sandbox records for platform UI and API evaluation | `/api/observations`, `/api/v1/modules/:id/data`, `/api/v1/climate/summary`, `/api/v1/climate/analyze`, `/api/reports/:id/export` | N/A (Explicitly labeled `isSampleData: true`) |
| `STAGED_CONNECTOR_REGISTRY` | Catalog of 10+ satellite mission adapters awaiting agency tokens/workers | `/api/connectors`, `/api/v1/connectors` | N/A |

---

## 2. Zero-Fabrication Policy in the Scientific Pipeline

Inside `server/services/scientificPipeline.ts`:
- When `NASA_EARTHDATA_TOKEN` is unset or binary granule extraction is not yet attached, the pipeline **never substitutes synthetic or random numbers** into `scientific_observations`.
- Instead, it executes live unauthenticated NASA CMR collection & granule discovery, builds the exact OPeNDAP subsetting template, records `status: "PENDING_CONFIGURATION"`, and reports `trendReport.status: "INSUFFICIENT_DATA"`.
- Missing months or fill markers (`-9999`, `-9999.9`, `1e+15`, `NaN`, blank cells) in imported CSV/JSON series are stored with `is_missing = 1`, `raw_value = NULL`, `normalized_value = NULL`, and `quality_flag = "MISSING_OR_FILL"`. They are **never** forward-filled or interpolated.

---

## 3. Sample Demonstration Surfaces

The following endpoints and tables contain seeded or deterministic demonstration data and always include `"isSampleData": true` and `"dataProvenance": "SAMPLE_DEMONSTRATION"` (plus response header `X-Climato-Data-Provenance: SAMPLE_DEMONSTRATION` on `/api/v1/*`):
- `sample_observations` (`GET /api/observations`, `GET /api/v1/modules/:moduleId/data`)
- `computeCoordinateRiskProfile()` (`POST /api/climate/analyze`, `POST /api/v1/climate/analyze`)
- `executeStagedPreview()` (`GET /api/v1/climate/summary`)
- `report_requests` exports (`GET /api/reports/:id/export`, `GET /api/v1/reports/:id/export`)

---

## 4. Database Provenance & Reproducibility Ledger

Every execution of `runScientificPipeline()` persists:
1. **`pipeline_runs`**: Stores `id`, `dataset_id`, `region_id`, `start_date`, `end_date`, `temporal_aggregation`, `provenance_type`, `status`, deterministic SHA-256 `query_hash` (first 20 hex chars), `records_ingested`, `valid_records`, `missing_periods`, `stage_report_json`, and `diagnostics_json`.
2. **`scientific_observations`**: Stores each monthly step with both `raw_value`/`raw_unit` and `normalized_value`/`normalized_unit`, `uncertainty`, `quality_flag`, `is_missing`, `native_spatial_resolution`, `provenance_type`, and `source_granule_ref`.
3. **`trend_analysis_cache`**: Keyed by `query_hash` for deterministic reproducibility across identical imports/parameters.
4. **`audit_logs`**: Records every mutation, pipeline run, alert evaluation, and key lifecycle event with `request_id` and timestamp.

---

## 5. Dataset Licensing & Attribution

- **NASA MERRA-2 (`M2TMNXSLV v5.12.4`)**: NASA Earth Science Open Data Policy (Public Domain / CC0-equivalent).
- **NASA/JAXA GPM IMERG Final (`GPM_3IMERGM v07`)**: NASA/JAXA Open Data Policy (Free & Open with attribution).
- **NASA GLDAS Noah 2.1 (`GLDAS_NOAH025_M v2.1`)**: NASA GES DISC Open Data Policy (Attribution requested).
- **NASA/GFZ GRACE & GRACE-FO Mascon CRI (`TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4`)**: NASA/JPL PO.DAAC Open Data Policy.
