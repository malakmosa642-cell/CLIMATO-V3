# NASA Earthdata & Satellite Integration Architecture

This guide documents how CLIMATO integrates with NASA Earthdata (CMR, GES DISC OPeNDAP, PO.DAAC, Giovanni, AppEEARS) and supporting research portals in `server/connectors/nasaEarthdataConnectors.ts` and `server/data/scientificCatalog.ts`.

---

## 1. Integrated NASA Scientific Datasets

| Dataset ID | Product / Version | Variable | CMR Short Name | Verified CMR Concept ID | Native Resolution | Access Method |
|---|---|---|---|---|---|---|
| `merra-2` | `M2TMNXSLV v5.12.4` | `T2M` (2m Air Temp) | `M2TMNXSLV` | `C1276812859-GES_DISC` (catalog ref: `C1276812863-GES_DISC`) | `0.5° × 0.625°` (~60 km) | Earthdata Token + GES DISC OPeNDAP / Giovanni |
| `gpm-imerg` | `GPM_3IMERGM v07` | `precipitation` | `GPM_3IMERGM` | `C2723754851-GES_DISC` (catalog ref: `C2723754864-GES_DISC`) | `0.1° × 0.1°` (~11 km) | Earthdata Token + GES DISC OPeNDAP / Giovanni |
| `gldas` | `GLDAS_NOAH025_M v2.1` | `SoilMoi0_10cm_inst` | `GLDAS_NOAH025_M` | `C1342986036-GES_DISC` (catalog ref: `C1342986035-GES_DISC`) | `0.25° × 0.25°` (~28 km) | Earthdata Token + GES DISC OPeNDAP / AppEEARS |
| `grace-fo` | `TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4` | `lwe_thickness` | `TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4` | `C3195527175-POCLOUD` (catalog ref: `C3165214266-POCLOUD`) | `3°` mascon (~300 km) | Earthdata Token + PO.DAAC Harmony / Giovanni |

*(Live CMR verification confirmed HTTP 200 and granule hits across all 4 collections for Northern Nile Delta: 60 granules each for MERRA-2, GPM IMERG, and GLDAS over 2020–2024, and 1 multi-year mascon file for GRACE-FO.)*

---

## 2. Two-Tier Acquisition Model

### Tier 1: Live Unauthenticated NASA CMR Discovery (Active Now)
`probeNasaCmrCollection()` queries:
1. `https://cmr.earthdata.nasa.gov/search/collections.json?short_name=<short_name>&page_size=1`
2. `https://cmr.earthdata.nasa.gov/search/granules.json?collection_concept_id=<id>&bounding_box=<minLon>,<minLat>,<maxLon>,<maxLat>&temporal=<start>,<end>&page_size=5`

This resolves live collection titles, temporal extents, total granule hit counts (`cmr-hits` header), and sample granule IDs without requiring user credentials.

### Tier 2: Authenticated Data Extraction & Giovanni/AppEEARS Ingestion
1. **Direct CSV / JSON Ingestion (`POST /api/science/import`) — Active End-to-End**:
   - Export area-averaged time series from **NASA Giovanni** (`https://giovanni.gsfc.nasa.gov/giovanni/`) or **NASA AppEEARS** (`https://appeears.earthdatacloud.nasa.gov/`).
   - `parseImportedObservationSeries()` strips `#` / `//` Giovanni preamble comments, auto-detects `time`/`date` and variable/uncertainty columns, screens `-9999`, `1e15`, and `NaN` fill values, converts units, persists to `scientific_observations`, and runs Mann-Kendall / Theil-Sen trend detection.
2. **Authenticated OPeNDAP / Harmony Extraction — Token + Worker Staged**:
   - When `NASA_EARTHDATA_TOKEN` is configured, `acquireDatasetObservations()` executes an authenticated `Authorization: Bearer <token>` probe against the dataset's OPeNDAP/Harmony endpoint and generates the exact spatial/temporal subsetting request template (`opendapRequestTemplate`).
   - **Honest Implementation Boundary**: Node.js runtime does not natively parse binary NetCDF4/HDF5 granules inline; automated binary granule download and pixel averaging require deploying an external Python/xarray/OPeNDAP extraction worker or using NASA AppEEARS asynchronous area-task polling + CSV download.

---

## 3. Research Hub Live Probing (`POST /api/science/probe-sources`)

CLIMATO tracks 12 Earth-observation and methodology references in `research_sources`:
- **Discovery Portals (`DISCOVERY_PORTAL`)**: NASA Giovanni, KNMI Climate Explorer, GEO.ca
- **Operational Data Sources (`PENDING_CONFIGURATION` until tokens set)**: NASA GES DISC Hydrology Time Series (`NASA_EARTHDATA_TOKEN`), NASA AppEEARS (`NASA_EARTHDATA_TOKEN`), NOAA CDO (`NOAA_CDO_TOKEN`)
- **Methodology References (`METHODOLOGY_REFERENCE`)**: Non-parametric trend literature, statistical significance guide, CSA SAR Tutorial
- **Supporting Missions (`SUPPORTING_MISSION`)**: RADARSAT RCM, SWOT, CSA Ecosystem Monitoring

Every probe enforces a 6.5s timeout (`AbortSignal.timeout(6500)`) and stores real HTTP status codes and timestamps in SQLite `research_sources`.

---

## 4. Configuring Credentials

1. Create a NASA Earthdata Login account (`https://urs.earthdata.nasa.gov/`) and authorize **NASA GESDISC DATA ARCHIVE** and **PO.DAAC**.
2. Generate an Earthdata Bearer Token and set `NASA_EARTHDATA_TOKEN` in server environment variables (never expose in `VITE_*` client variables).
3. Optionally configure `NOAA_CDO_TOKEN`, `COPERNICUS_DATA_SPACE_TOKEN`, and `USGS_EROS_M2M_TOKEN` for secondary station validation and optical/SAR connectors.
