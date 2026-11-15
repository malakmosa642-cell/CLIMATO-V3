# NASA Earthdata & Satellite Integration Architecture

This guide documents how CLIMATO integrates with NASA Earthdata (CMR, GES DISC OPeNDAP, PO.DAAC, Giovanni, AppEEARS) in `server/connectors/nasaEarthdataConnectors.ts` and `server/data/scientificCatalog.ts`.

---

## 1. Integrated NASA Scientific Datasets

| Dataset ID | Product / Version | Variable | CMR Short Name | Native Resolution | Access Method |
|---|---|---|---|---|---|
| `merra-2` | `M2TMNXSLV v5.12.4` | `T2M` (2m Air Temp) | `M2TMNXSLV` | `0.5° × 0.625°` (~60 km) | Earthdata Token (NetCDF-3 / OPeNDAP) + Giovanni CSV |
| `gpm-imerg` | `GPM_3IMERGM v07` | `precipitation` | `GPM_3IMERGM` | `0.1° × 0.1°` (~11 km) | Earthdata Token (OPeNDAP / HDF5-to-ASCII) + Giovanni CSV |
| `gldas` | `GLDAS_NOAH025_M v2.1` | `SoilMoi0_10cm_inst` | `GLDAS_NOAH025_M` | `0.25° × 0.25°` (~28 km) | Earthdata Token (NetCDF-3 / OPeNDAP) + AppEEARS CSV |
| `grace-fo` | `TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4` | `lwe_thickness` | `TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4` | `3°` mascon (~300 km) | Earthdata Token (OPeNDAP / NetCDF-3) + PO.DAAC / Giovanni |

---

## 2. Complete End-to-End Ingestion Workflow

### Stage 1: Live NASA CMR Discovery (`probeNasaCmrCollection`)
Queries NASA Common Metadata Repository unauthenticated REST API:
1. `GET /search/collections.json?short_name=<short_name>&page_size=1` -> resolves collection Concept ID and temporal extent.
2. `GET /search/granules.json?collection_concept_id=<id>&bounding_box=<bbox>&temporal=<start>,<end>&page_size=120` -> resolves granule hits, sample granule IDs, and direct `.nc`/`.nc4`/`OPeNDAP` links.

### Stage 2: Credential Gate & URS Redirect Handling (`acquireNasaDatasetForRegion`)
- **When `NASA_EARTHDATA_TOKEN` is missing**: Returns `status: "PENDING_CONFIGURATION"` and `blockerCode: "BLOCKED_BY_CREDENTIALS"` with zero fabricated observations.
- **When `NASA_EARTHDATA_TOKEN` is configured**:
  - Downloads granules via `fetchWithEarthdataAuth()`, following URS/Earthdata redirects while sending `Authorization: Bearer <token>` strictly to verified trusted Earthdata domains (`earthdata.nasa.gov`, `gesdisc.eosdis.nasa.gov`, `podaac.earthdata.nasa.gov`, `nsidc.org`, `lpdaac.usgs.gov`, or test hosts in `NASA_EARTHDATA_ALLOWED_TEST_HOSTS`).
  - Computes per-granule and aggregate SHA-256 `provenanceChecksum` for verifiable integrity.
  - Parses **Classic NetCDF-3** (`CDF\x01`/`CDF\x02`) streams via `parseNetCdfClassicGrid()` (extracting `lat`, `lon`, `time`, `units`, `_FillValue`/`missing_value`, and computing bounding-box regional spatial means) and **OPeNDAP ASCII / JSON** responses via `parseOpendapAsciiOrJsonGranule()`.
  - **Runtime Format Constraint**: Classic NetCDF-3, OPeNDAP ASCII/JSON, and Giovanni/AppEEARS CSV/JSON run natively inside Node.js without external binaries. Native NetCDF-4 / HDF5 binary compression (HDF5 containers returned when requesting raw `.nc4` without OPeNDAP `.ascii` subsetting) requires using OPeNDAP `.ascii` subset links or exporting via Giovanni/AppEEARS CSV.

### Stage 3: Strict User CSV / JSON Ingestion (`POST /api/science/import`)
`parseImportedObservationSeries()` validates every row:
- Rejects empty files, malformed rows (`< 2` columns), unparseable dates, duplicate monthly timestamps, non-numeric non-fill tokens, out-of-bounds WGS84 coordinates, and fixture/synthetic source labels.
- Screens fill markers (`-9999`, `-9999.9`, `1e15`, `NaN`, blank) as `MISSING_OR_FILL` (`rawValue = null`) without synthetic interpolation.

---

## 3. Configuring Credentials

1. Create a NASA Earthdata Login account (`https://urs.earthdata.nasa.gov/`) and authorize **NASA GESDISC DATA ARCHIVE** and **PO.DAAC**.
2. Generate an Earthdata Bearer Token and set `NASA_EARTHDATA_TOKEN` in server `.env` (never expose in `VITE_*` client variables).
