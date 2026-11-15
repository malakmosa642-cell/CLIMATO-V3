# CLIMATO Scientific Methodology

This document specifies the mathematical models, spatial scale constraints, unit conversions, and statistical significance guardrails implemented in `server/services/trendAnalysisEngine.ts`, `server/services/scientificPipeline.ts`, and `server/services/geospatialEngine.ts`.

---

## 1. Study Regions (Egypt Benchmark Domains — CRS `EPSG:4326`)

Defined in `server/data/scientificCatalog.ts` and persisted in `study_regions`:

| Region ID | Name | Bounds (WGS84 `EPSG:4326`) | Approx Area | Primary Stressors |
|---|---|---|---|---|
| `nile-delta-north` | Northern Nile Delta (Coastal & Agro Belt) | `30.72..31.58°N`, `29.90..31.95°E` | ~11,800 km² | Saltwater intrusion, winter rainfall variability, coastal thermal moderation |
| `greater-cairo` | Greater Cairo Metropolitan Basin | `29.82..30.26°N`, `31.02..31.52°E` | ~1,950 km² | Urban heat amplification, impervious runoff, aerosol loading |
| `upper-egypt-agro` | Upper Egypt Agricultural Corridor (Minya–Assiut) | `27.10..28.35°N`, `30.55..31.08°E` | ~4,200 km² | Hyper-arid summer extremes, evaporative demand, canal irrigation dependency |

Regions are reconfigurable via `PUT /api/science/regions/:id` within validated Egypt bounds (`20..34°N`, `22..38°E`).

---

## 2. Nine-Stage Scientific Pipeline

Implemented in `runScientificPipeline()` (`server/services/scientificPipeline.ts`):

1. **Discovery & Acquisition**: Live NASA CMR collection & granule lookup, authenticated NetCDF-3/OPeNDAP granule download (`acquireNasaDatasetForRegion`), or validated Giovanni/AppEEARS CSV/JSON ingestion.
2. **Temporal Grid Construction**: Expands `[startDate, endDate]` into a monthly grid (`YYYY-MM-01`, up to 600 steps).
3. **Quality Filtering**: Screens fill markers (`<= -999`, `|x| >= 1e14`, `NaN`, `null`, blank tokens).
4. **Missing-Data Handling**: Preserves unobserved steps (`is_missing = 1`) without synthetic imputation.
5. **Spatial Aggregation & Footprint Check**: Compares native sensor footprint against region lat/lon span (`111.32 km/deg` latitude, `111.32 * cos(lat)` longitude) and flags `footprintExceedsRegion` when footprint exceeds the narrower axis.
6. **Temporal Aggregation**: Supports `monthly`, `seasonal` (`DJF`/`MAM`/`JJA`/`SON`), and `annual` aggregation.
7. **Unit Normalization**:
   - **MERRA-2 `T2M`**: `T_°C = T_K - 273.15` (if `rawValue > 150` and not pre-normalized)
   - **GPM IMERG `precipitation`**: `P_mm_month = P_mm_hr * 24 * daysInMonth(year, month)` (leap-year aware via `Date.UTC(year, month, 0)`)
   - **GLDAS `SoilMoi0_10cm_inst`**: Preserved in `kg/m²` (`1 kg/m² = 1 mm` water depth in 0–10 cm column)
   - **GRACE-FO `lwe_thickness`**: Preserved in `cm` equivalent water thickness relative to 2004–2009 baseline
8. **Provenance & Persistence**: Writes run checksums, ingest source, and observations inside a SQLite transaction.
9. **Caching & Reproducibility**: Indexes deterministic SHA-256 `query_hash` in `trend_analysis_cache`.

---

## 3. Non-Parametric Trend Detection (`trendAnalysisEngine.ts`)

CLIMATO uses rank-based non-parametric estimators rather than Ordinary Least Squares (OLS), because hydrometeorological series are frequently skewed, zero-inflated, or contain missing months.

### 3.1 Mann-Kendall Statistic ($S$), Ties & Variance
$$S = \sum_{i=1}^{n-1} \sum_{j=i+1}^{n} \operatorname{sgn}(x_j - x_i), \qquad \operatorname{Var}(S) = \frac{n(n-1)(2n+5) - \sum_{p=1}^{g} t_p(t_p-1)(2t_p+5)}{18}$$
Two-sided $p$-value uses `erfc(|Z| / sqrt(2))` via Abramowitz & Stegun (7.1.26) after continuity correction on $S$.

### 3.2 Hamed & Rao (1998) Serial Autocorrelation Correction
- Computes lag-1 autocorrelation $\rho_1$ and effective sample size $n_{\text{eff}} = \max\left(2, n \frac{1 - \rho_1}{1 + \rho_1}\right)$.
- When $n \ge 10$ and $|\rho_1| > 1.96/\sqrt{n}$, computes modified variance $\operatorname{Var}^*(S)$ over significant rank autocorrelation lags up to $\min(n-3, 12)$ and bases significance (`SIGNIFICANT_TREND` vs `NO_SIGNIFICANT_TREND`) on `modifiedPValue < 0.05`.

### 3.3 Theil-Sen Slope & Ordered 95% Confidence Bounds
- **Slope**: $\hat{\beta} = \operatorname{median}\left(\frac{x_j - x_i}{t_j - t_i}\right)$ reported per year and per decade.
- **95% CI**: Clamped order statistics $M_1, M_2$ from $C_\alpha = 1.95996 \sqrt{\operatorname{Var}(S)}$, ensuring `ci95Lower <= slope <= ci95Upper` even at boundary sample sizes ($n = 10$).

### 3.4 Strict Significance Guardrails
Suppresses all significance claims (`status = "INSUFFICIENT_DATA"`, `pValueTwoSided = null`, `slopePerYear = null`, `trendDirection = "UNDETERMINED"`) whenever `validObservations < 10` or `coveragePct < 70%`.

---

## 4. Dual-Mode Geospatial Profile (`geospatialEngine.ts`)

- **Demonstration Mode (`DEMONSTRATION_SAMPLE`)**: Synthesized illustrative indices clearly marked `isSampleData: true`.
- **Scientific Mode (`SCIENTIFIC`, `/api/science/coordinate-profile`)**: Strictly intersects WGS84 `EPSG:4326` query coordinates against configured study region bounding boxes — refusing to extrapolate outside region boundaries and returning `INSUFFICIENT_DATA` when no real `LIVE_NASA_EARTHDATA` / `IMPORTED_OBSERVATIONS` series exist.
- Great-circle distances for geofence evaluation use the Haversine formula ($R = 6371\text{ km}$).
