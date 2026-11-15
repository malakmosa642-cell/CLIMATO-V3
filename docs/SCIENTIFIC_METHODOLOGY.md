# CLIMATO Scientific Methodology

This document specifies the mathematical models, spatial scale constraints, unit conversions, and statistical significance guardrails implemented in `server/services/trendAnalysisEngine.ts`, `server/services/scientificPipeline.ts`, and `server/services/geospatialEngine.ts`.

---

## 1. Study Regions (Egypt Benchmark Domains)

Defined in `server/data/scientificCatalog.ts` and persisted in `study_regions`:

| Region ID | Name | Bounds (WGS84 EPSG:4326) | Approx Area | Primary Stressors |
|---|---|---|---|---|
| `nile-delta-north` | Northern Nile Delta (Coastal & Agro Belt) | `30.72..31.58°N`, `29.90..31.95°E` | ~11,800 km² | Saltwater intrusion, winter rainfall variability, coastal thermal moderation |
| `greater-cairo` | Greater Cairo Metropolitan Basin | `29.82..30.26°N`, `31.02..31.52°E` | ~1,950 km² | Urban heat amplification, impervious runoff, aerosol loading |
| `upper-egypt-agro` | Upper Egypt Agricultural Corridor (Minya–Assiut) | `27.10..28.35°N`, `30.55..31.08°E` | ~4,200 km² | Hyper-arid summer extremes, evaporative demand, canal irrigation dependency |

Regions are reconfigurable via `PUT /api/science/regions/:id` within validated Egypt bounds (`20..34°N`, `22..38°E`).

---

## 2. Nine-Stage Scientific Pipeline

Implemented in `runScientificPipeline()` (`server/services/scientificPipeline.ts`):

1. **Discovery & Acquisition**: Live NASA CMR collection & granule lookup + OPeNDAP URL templating, or CSV/JSON ingestion.
2. **Temporal Grid Construction**: Expands `[startDate, endDate]` into a complete monthly grid (`YYYY-MM-01`) up to 600 steps.
3. **Quality Filtering**: Screens fill markers (`<= -999`, `|x| >= 1e14`, `NaN`, `null`, blank tokens).
4. **Missing-Data Handling**: Preserves unobserved steps (`is_missing = 1`) without synthetic imputation.
5. **Spatial Aggregation & Footprint Check**: Compares native sensor footprint against region lat/lon span (`111.32 km/deg` latitude, `111.32 * cos(lat)` longitude). Emits explicit `scaleWarningEn`/`scaleWarningAr` when sensor footprint exceeds the narrower axis.
6. **Temporal Aggregation**: Supports `monthly`, `seasonal` (astronomical/meteorological DJF/MAM/JJA/SON), and `annual` aggregation (preserving `null` if all points in a bucket are missing).
7. **Unit Normalization**:
   - **MERRA-2 `T2M`**: `T_°C = T_K - 273.15` (if `rawValue > 150` and not pre-normalized)
   - **GPM IMERG `precipitation`**: `P_mm_month = P_mm_hr * 24 * daysInMonth(year, month)` (leap-year aware via `Date.UTC(year, month, 0)`)
   - **GLDAS `SoilMoi0_10cm_inst`**: Preserved in `kg/m²` (`1 kg/m² = 1 mm` water depth in 0–10 cm column)
   - **GRACE-FO `lwe_thickness`**: Preserved in `cm` equivalent water thickness relative to 2004–2009 baseline
8. **Provenance & Persistence**: Writes run metadata and observations to SQLite (`pipeline_runs`, `scientific_observations`).
9. **Caching & Reproducibility**: Indexes deterministic SHA-256 `query_hash` in `trend_analysis_cache`.

---

## 3. Non-Parametric Trend Detection (`trendAnalysisEngine.ts`)

CLIMATO uses rank-based non-parametric estimators rather than Ordinary Least Squares (OLS), because hydrometeorological series (e.g., hyper-arid rainfall, soil moisture, and GRACE mascons) are frequently skewed, zero-inflated, or contain gaps.

### 3.1 Decimal Time Coordinate
$$t_i = \text{year}_i + \frac{\text{month}_i - 0.5}{12}$$

### 3.2 Mann-Kendall Statistic ($S$) & Tie-Corrected Variance
$$S = \sum_{i=1}^{n-1} \sum_{j=i+1}^{n} \operatorname{sgn}(x_j - x_i)$$

$$\operatorname{Var}(S) = \frac{n(n-1)(2n+5) - \sum_{p=1}^{g} t_p(t_p-1)(2t_p+5)}{18}$$

where $g$ is the number of tie groups and $t_p$ is the number of observations in tie group $p$. The continuity-corrected $Z$-score is:
$$Z = \begin{cases} \frac{S - 1}{\sqrt{\operatorname{Var}(S)}} & S > 0 \\ 0 & S = 0 \\ \frac{S + 1}{\sqrt{\operatorname{Var}(S)}} & S < 0 \end{cases}$$

Two-sided $p$-value is computed via Abramowitz & Stegun (7.1.26) `erfc(|Z| / sqrt(2))`.

### 3.3 Autocorrelation Adjustment (Hamed & Rao, 1998)
Monthly climate series frequently exhibit serial persistence (positive lag-1 autocorrelation $\rho_1$), which inflates classical Mann-Kendall false-positive rates:
- Lag-1 autocorrelation $\rho_1$ and effective sample size $n_{\text{eff}} = \max\left(2, n \frac{1 - \rho_1}{1 + \rho_1}\right)$ are always reported.
- When $n \ge 10$ and $|\rho_1| > 1.96 / \sqrt{n}$, `autocorrelationConcern = true` and CLIMATO computes Hamed-Rao rank autocorrelations up to lag $\min(n-3, 12)$:
  $$\operatorname{Var}^*(S) = \operatorname{Var}(S) \cdot \max\left(0.25,\; 1 + \frac{2}{n(n-1)(n-2)} \sum_{k : |\rho_k| > \frac{1.96}{\sqrt{n}}} (n-k)(n-k-1)(n-k-2)\rho_k\right)$$
- Under `autocorrelationConcern = true`, trend significance (`SIGNIFICANT_TREND` vs `NO_SIGNIFICANT_TREND`) is governed by `modifiedPValue < 0.05`.

### 3.4 Theil-Sen Slope & 95% Confidence Interval
All $\binom{n}{2}$ pairwise slopes $Q_{ij} = \frac{x_j - x_i}{t_j - t_i}$ ($t_j > t_i$) are sorted:
- **Slope**: $\hat{\beta} = \operatorname{median}(Q_{ij})$ (reported per year and per decade `10 * slope`).
- **Intercept**: $\hat{\alpha} = \operatorname{median}(x_i - \hat{\beta}(t_i - t_0))$.
- **95% CI**: Order statistics at indices $\lfloor (N - C_\alpha)/2 \rfloor$ and $\lceil (N + C_\alpha)/2 \rceil - 1$, where $C_\alpha = 1.95996 \sqrt{\operatorname{Var}(S)}$.

### 3.5 Seasonal Breakdown (DJF, MAM, JJA, SON)
- Winter (`DJF`) groups December of year $Y$ with January and February of year $Y+1$ (hydrological winter).
- Each season computes annual seasonal means and requires at least **6 valid seasonal years** before reporting Mann-Kendall / Theil-Sen metrics.

### 3.6 Strict Significance Guardrails
CLIMATO suppresses all significance claims (`status = "INSUFFICIENT_DATA"`, `pValueTwoSided = null`, `slopePerYear = null`, `trendDirection = "UNDETERMINED"`) whenever:
- `validObservations < 10`, **or**
- `coveragePct < 70%`.

---

## 4. Spatial Footprint Warnings

- **GRACE-FO (`~300 km` native mascon)**: Exceeds both Greater Cairo (`~49×48 km`) and Northern Nile Delta (`~96×195 km`); Greater Cairo and Northern Delta share overlapping mascon mass sensitivity.
- **MERRA-2 (`~60 km`)**: Exceeds Greater Cairo's minor axis (`~48 km`); synoptic grid cell mixes urban Cairo with surrounding desert.

---

## 5. Geospatial Distance Calculation (`geospatialEngine.ts`)

Great-circle distance between WGS84 coordinates uses the Haversine formula with mean Earth radius $R = 6371\text{ km}$.
