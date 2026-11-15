import crypto from 'node:crypto';
import { db, recordAuditLog } from '../db/database.ts';
import {
  DEFAULT_STUDY_REGIONS,
  SCIENTIFIC_DATASETS,
  ScientificDatasetSpec,
  StudyRegionSpec,
} from '../data/scientificCatalog.ts';
import {
  acquireNasaDatasetForRegion,
  CmrDiscoveryResult,
  parseImportedObservationSeries,
  RawAcquiredRecord,
} from '../connectors/nasaEarthdataConnectors.ts';
import {
  analyzeTimeSeriesTrends,
  TimeSeriesPoint,
  TrendAnalysisReport,
} from './trendAnalysisEngine.ts';

export type ProvenanceMode =
  | 'LIVE_NASA_EARTHDATA'
  | 'IMPORTED_OBSERVATIONS'
  | 'METHODOLOGICAL_TEST_FIXTURE';

export type TemporalAggregationMode = 'monthly' | 'seasonal' | 'annual';

export interface PipelineStageResult {
  stage: string;
  status: 'COMPLETED' | 'PENDING_CONFIGURATION' | 'WARNING';
  summary: string;
  metrics?: Record<string, unknown>;
}

export interface SpatialFootprintAssessment {
  nativeResolution: string;
  nativeFootprintKm: number;
  regionSpanLatKm: number;
  regionSpanLonKm: number;
  regionAreaKm2: number;
  footprintExceedsRegion: boolean;
  scaleWarningEn: string | null;
  scaleWarningAr: string | null;
}

export interface ScientificPipelineExecutionResult {
  runId: string;
  queryHash: string;
  cached: boolean;
  dataset: ScientificDatasetSpec;
  region: StudyRegionSpec;
  provenanceType: ProvenanceMode | 'PENDING_CONFIGURATION';
  isRealObservation: boolean;
  status: 'COMPLETED' | 'PENDING_CONFIGURATION' | 'INSUFFICIENT_DATA';
  temporalAggregation: TemporalAggregationMode;
  startDate: string;
  endDate: string;
  cmrDiscovery: CmrDiscoveryResult | null;
  opendapRequestTemplate: string;
  configurationSteps: string[];
  spatialAssessment: SpatialFootprintAssessment;
  stages: PipelineStageResult[];
  series: Array<{
    obsDate: string;
    year: number;
    month: number;
    rawValue: number | null;
    rawUnit: string;
    normalizedValue: number | null;
    normalizedUnit: string;
    uncertainty: number | null;
    qualityFlag: string;
    isMissing: boolean;
    sourceGranuleRef: string;
  }>;
  trendReport: TrendAnalysisReport | null;
  message: string;
}

function getStudyRegionFromDb(regionId: string): StudyRegionSpec | null {
  const row = db.prepare('SELECT * FROM study_regions WHERE id = ?').get(regionId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  return {
    id: row.id as StudyRegionSpec['id'],
    nameEn: String(row.name_en),
    nameAr: String(row.name_ar),
    classificationEn: String(row.classification_en),
    classificationAr: String(row.classification_ar),
    centerLat: Number(row.center_lat),
    centerLon: Number(row.center_lon),
    minLat: Number(row.min_lat),
    maxLat: Number(row.max_lat),
    minLon: Number(row.min_lon),
    maxLon: Number(row.max_lon),
    approxAreaKm2: Number(row.approx_area_km2),
    selectionRationaleEn: String(row.selection_rationale_en),
    selectionRationaleAr: String(row.selection_rationale_ar),
    primaryClimateStressorsEn: String(row.primary_stressors_en),
    primaryClimateStressorsAr: String(row.primary_stressors_ar),
    isDefault: Boolean(row.is_default),
  };
}

export function listStudyRegionsFromDb(): StudyRegionSpec[] {
  const rows = db.prepare('SELECT * FROM study_regions ORDER BY center_lat DESC').all() as Array<
    Record<string, unknown>
  >;
  if (rows.length === 0) return DEFAULT_STUDY_REGIONS;
  return rows.map((row) => ({
    id: row.id as StudyRegionSpec['id'],
    nameEn: String(row.name_en),
    nameAr: String(row.name_ar),
    classificationEn: String(row.classification_en),
    classificationAr: String(row.classification_ar),
    centerLat: Number(row.center_lat),
    centerLon: Number(row.center_lon),
    minLat: Number(row.min_lat),
    maxLat: Number(row.max_lat),
    minLon: Number(row.min_lon),
    maxLon: Number(row.max_lon),
    approxAreaKm2: Number(row.approx_area_km2),
    selectionRationaleEn: String(row.selection_rationale_en),
    selectionRationaleAr: String(row.selection_rationale_ar),
    primaryClimateStressorsEn: String(row.primary_stressors_en),
    primaryClimateStressorsAr: String(row.primary_stressors_ar),
    isDefault: Boolean(row.is_default),
  }));
}

export function assessSpatialResolution(
  dataset: ScientificDatasetSpec,
  region: StudyRegionSpec
): SpatialFootprintAssessment {
  const meanLatRad = ((region.minLat + region.maxLat) / 2) * (Math.PI / 180);
  const latKm = Math.abs(region.maxLat - region.minLat) * 111.32;
  const lonKm = Math.abs(region.maxLon - region.minLon) * 111.32 * Math.cos(meanLatRad);
  const minSpanKm = Math.min(latKm, lonKm);
  const footprintExceedsRegion = dataset.nativeFootprintKm > minSpanKm;

  let scaleWarningEn: string | null = null;
  let scaleWarningAr: string | null = null;

  if (dataset.id === 'grace-fo') {
    scaleWarningEn = `Native GRACE-FO mascon resolution (~300 km) is wider than ${region.nameEn} (${latKm.toFixed(
      0
    )}×${lonKm.toFixed(
      0
    )} km). Results reflect regional basin-scale gravimetric mass, never parcel-level or urban district storage.`;
    scaleWarningAr = `الدقة الفيزيائية لـ GRACE-FO (~300 كم) أكبر من أبعاد ${region.nameAr} (${latKm.toFixed(
      0
    )}×${lonKm.toFixed(0)} كم). القيم تعكس الكتلة المائية الحوضية ولا تمثل قياساً على مستوى الحقول أو الأحياء.`;
  } else if (footprintExceedsRegion) {
    scaleWarningEn = `Native sensor grid cell (~${dataset.nativeFootprintKm} km) exceeds the narrower boundary axis (${minSpanKm.toFixed(
      0
    )} km); bounding-box average includes adjacent desert/agricultural pixels.`;
    scaleWarningAr = `حجم الخلية الشبكية للمستشعر (~${dataset.nativeFootprintKm} كم) يتجاوز المحور الأصغر للمنطقة (${minSpanKm.toFixed(
      0
    )} كم)؛ لذا يشمل المتوسط نقاطاً مجاورة.`;
  }

  return {
    nativeResolution: dataset.spatialResolution,
    nativeFootprintKm: dataset.nativeFootprintKm,
    regionSpanLatKm: Number(latKm.toFixed(1)),
    regionSpanLonKm: Number(lonKm.toFixed(1)),
    regionAreaKm2: region.approxAreaKm2,
    footprintExceedsRegion,
    scaleWarningEn,
    scaleWarningAr,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeUnitValue(
  dataset: ScientificDatasetSpec,
  rawValue: number | null,
  year: number,
  month: number,
  alreadyNormalizedHint = false
): number | null {
  if (rawValue === null || !Number.isFinite(rawValue)) return null;

  if (dataset.id === 'merra-2') {
    // MERRA-2 native T2M is Kelvin (~280-320K); if user CSV already exported °C (<120), keep °C
    const celsius = !alreadyNormalizedHint && rawValue > 150 ? rawValue - 273.15 : rawValue;
    return Number(celsius.toFixed(3));
  }
  if (dataset.id === 'gpm-imerg') {
    // GPM IMERG native is mm/hr; monthly conversion multiplies by 24 * daysInMonth
    const mmMonth = !alreadyNormalizedHint ? rawValue * 24 * daysInMonth(year, month) : rawValue;
    return Number(mmMonth.toFixed(3));
  }
  if (dataset.id === 'gldas') {
    // GLDAS SoilMoi0_10cm_inst is kg/m² (= mm water depth in 0-10cm); keep native physical unit
    return Number(rawValue.toFixed(3));
  }
  // GRACE-FO lwe_thickness is cm
  return Number(rawValue.toFixed(3));
}

function buildExpectedMonthGrid(startDate: string, endDate: string): Array<{ year: number; month: number; obsDate: string }> {
  const startY = Number(startDate.slice(0, 4));
  const startM = Number(startDate.slice(5, 7));
  const endY = Number(endDate.slice(0, 4));
  const endM = Number(endDate.slice(5, 7));

  const grid: Array<{ year: number; month: number; obsDate: string }> = [];
  let y = startY;
  let m = startM;
  let guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard < 600) {
    grid.push({
      year: y,
      month: m,
      obsDate: `${y}-${String(m).padStart(2, '0')}-01`,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return grid;
}

/**
 * Deterministic methodological validation fixture ONLY for testing statistical pipelines
 * when NASA Earthdata credentials / uploaded Giovanni CSVs are not yet supplied.
 * Explicitly tagged `METHODOLOGICAL_TEST_FIXTURE` and `isRealObservation: false`.
 */
function buildMethodologicalTestFixture(
  dataset: ScientificDatasetSpec,
  region: StudyRegionSpec,
  startDate: string,
  endDate: string
): RawAcquiredRecord[] {
  const months = buildExpectedMonthGrid(startDate, endDate);
  const regionHash =
    region.id === 'nile-delta-north' ? 0 : region.id === 'greater-cairo' ? 1 : 2;

  return months.map((m, idx) => {
    const tYr = idx / 12;
    const phase = ((m.month - 1) / 12) * Math.PI * 2;
    let rawValue: number | null = null;
    let qualityFlag = 'TEST_FIXTURE_SYNTHETIC_BENCHMARK';

    // Preserve realistic GRACE/GRACE-FO 2017-07 .. 2018-05 inter-mission gap for realistic missing-data diagnostics
    if (
      dataset.id === 'grace-fo' &&
      ((m.year === 2017 && m.month >= 7) || (m.year === 2018 && m.month <= 5))
    ) {
      return {
        obsDate: m.obsDate,
        year: m.year,
        month: m.month,
        rawValue: null,
        uncertainty: null,
        qualityFlag: 'INTER_MISSION_GAP_TEST_FIXTURE',
        sourceGranuleRef: 'METHODOLOGICAL_FIXTURE_NOT_REAL_OBSERVATION',
      };
    }

    if (dataset.id === 'merra-2') {
      // Kelvin (normalized to °C): ~21.5°C base + seasonal cycle + ~0.04°C/yr benchmark drift
      const baseC = [20.9, 22.1, 24.0][regionHash];
      const amp = [5.8, 7.2, 8.6][regionHash];
      const trend = [0.036, 0.048, 0.041][regionHash];
      const valC = baseC - amp * Math.cos(phase) + trend * tYr + Math.sin(idx * 1.7) * 0.35;
      rawValue = Number((valC + 273.15).toFixed(2));
    } else if (dataset.id === 'gpm-imerg') {
      // mm/hr raw rate -> normalized mm/month
      const winterWeight = Math.max(0, Math.cos(phase));
      const baseMmMonth = [14.5, 2.8, 0.6][regionHash] * Math.pow(winterWeight, 1.8);
      const valMmMonth = Math.max(0, baseMmMonth + (idx % 5 === 0 ? 1.2 : 0));
      rawValue = Number((valMmMonth / (24 * daysInMonth(m.year, m.month))).toFixed(5));
    } else if (dataset.id === 'gldas') {
      // kg/m² (0-10cm)
      const baseSm = [23.8, 13.4, 17.6][regionHash];
      const trend = [-0.09, -0.05, -0.06][regionHash];
      rawValue = Number(
        Math.max(4, baseSm + 2.4 * Math.cos(phase) + trend * tYr + Math.cos(idx * 1.3) * 0.45).toFixed(2)
      );
    } else {
      // GRACE-FO cm LWE (Cairo & Delta share ~300km basin signature)
      const baseTws = [1.2, 1.0, -0.4][regionHash];
      const trend = [-0.32, -0.30, -0.44][regionHash];
      rawValue = Number((baseTws + 2.1 * Math.sin(phase) + trend * tYr + Math.sin(idx * 1.1) * 0.3).toFixed(2));
    }

    return {
      obsDate: m.obsDate,
      year: m.year,
      month: m.month,
      rawValue,
      uncertainty: dataset.id === 'grace-fo' ? 1.35 : null,
      qualityFlag,
      sourceGranuleRef: 'METHODOLOGICAL_FIXTURE_NOT_REAL_OBSERVATION',
    };
  });
}

function aggregateTemporally(
  points: Array<{
    obsDate: string;
    year: number;
    month: number;
    normalizedValue: number | null;
    uncertainty: number | null;
    qualityFlag: string;
  }>,
  mode: TemporalAggregationMode
): TimeSeriesPoint[] {
  if (mode === 'monthly') {
    return points.map((p) => ({
      obsDate: p.obsDate,
      year: p.year,
      month: p.month,
      value: p.normalizedValue,
      uncertainty: p.uncertainty,
      qualityFlag: p.qualityFlag,
    }));
  }

  if (mode === 'annual') {
    const byYear = new Map<number, number[]>();
    for (const p of points) {
      if (p.normalizedValue === null) continue;
      const arr = byYear.get(p.year) || [];
      arr.push(p.normalizedValue);
      byYear.set(p.year, arr);
    }
    return Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([yr, vals]) => ({
        obsDate: `${yr}-06-01`,
        year: yr,
        month: 6,
        value: vals.length >= 9 ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4)) : null,
        qualityFlag: vals.length >= 9 ? 'ANNUAL_MEAN_VALID' : 'INCOMPLETE_YEAR_MASKED',
      }));
  }

  // Seasonal (DJF=1, MAM=4, JJA=7, SON=10)
  const buckets = new Map<string, { year: number; month: number; vals: number[] }>();
  for (const p of points) {
    if (p.normalizedValue === null) continue;
    const sYear = p.month === 12 ? p.year + 1 : p.year;
    const sMonth = p.month === 12 || p.month <= 2 ? 1 : p.month <= 5 ? 4 : p.month <= 8 ? 7 : 10;
    const key = `${sYear}-${sMonth}`;
    const entry = buckets.get(key) || { year: sYear, month: sMonth, vals: [] };
    entry.vals.push(p.normalizedValue);
    buckets.set(key, entry);
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((b) => ({
      obsDate: `${b.year}-${String(b.month).padStart(2, '0')}-01`,
      year: b.year,
      month: b.month,
      value: b.vals.length >= 2 ? Number((b.vals.reduce((x, y) => x + y, 0) / b.vals.length).toFixed(4)) : null,
      qualityFlag: b.vals.length >= 2 ? 'SEASONAL_MEAN_VALID' : 'INCOMPLETE_SEASON_MASKED',
    }));
}

export async function runScientificPipeline(params: {
  datasetId: ScientificDatasetSpec['id'];
  regionId: StudyRegionSpec['id'];
  startDate?: string;
  endDate?: string;
  temporalAggregation?: TemporalAggregationMode;
  mode?: ProvenanceMode;
  importedRawText?: string;
  importedFormat?: 'csv' | 'json';
  importedAlreadyNormalized?: boolean;
  importedSourceLabel?: string;
  requestId?: string;
}): Promise<ScientificPipelineExecutionResult> {
  const dataset = SCIENTIFIC_DATASETS.find((d) => d.id === params.datasetId);
  if (!dataset) {
    throw new Error(`Unsupported scientific dataset '${params.datasetId}'. Allowed: merra-2, gpm-imerg, gldas, grace-fo.`);
  }

  const region = getStudyRegionFromDb(params.regionId) || DEFAULT_STUDY_REGIONS.find((r) => r.id === params.regionId);
  if (!region) {
    throw new Error(`Unknown Egyptian study region '${params.regionId}'.`);
  }

  const startDate = params.startDate || '2015-01-01';
  const endDate = params.endDate || '2024-12-31';
  const temporalAggregation: TemporalAggregationMode = params.temporalAggregation || 'monthly';
  const requestedMode: ProvenanceMode = params.mode || 'LIVE_NASA_EARTHDATA';

  const queryHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        datasetId: dataset.id,
        regionId: region.id,
        bbox: [region.minLat, region.maxLat, region.minLon, region.maxLon],
        startDate,
        endDate,
        temporalAggregation,
        mode: requestedMode,
        importHash: params.importedRawText
          ? crypto.createHash('sha1').update(params.importedRawText).digest('hex')
          : null,
      })
    )
    .digest('hex')
    .slice(0, 24);

  const runId = `run-${Date.now().toString(36)}-${queryHash.slice(0, 6)}`;
  const spatialAssessment = assessSpatialResolution(dataset, region);
  const stages: PipelineStageResult[] = [];

  let acquiredRecords: RawAcquiredRecord[] = [];
  let effectiveProvenance: ProvenanceMode | 'PENDING_CONFIGURATION' = requestedMode;
  let cmrDiscovery: CmrDiscoveryResult | null = null;
  let opendapRequestTemplate = `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=${dataset.cmrShortName}`;
  let configurationSteps: string[] = [];
  let message = '';

  // STAGE 1: ACQUISITION
  if (requestedMode === 'IMPORTED_OBSERVATIONS' && params.importedRawText) {
    acquiredRecords = parseImportedObservationSeries({
      rawText: params.importedRawText,
      format: params.importedFormat,
      sourceLabel: params.importedSourceLabel,
    });
    stages.push({
      stage: '1. Data Acquisition',
      status: 'COMPLETED',
      summary: `Parsed ${acquiredRecords.length} imported observation rows from ${
        params.importedSourceLabel || 'NASA Giovanni / AppEEARS CSV'
      }.`,
      metrics: { rawRows: acquiredRecords.length },
    });
    message = `Processed ${acquiredRecords.length} imported observations for ${region.nameEn} (${dataset.productId}).`;
  } else if (requestedMode === 'METHODOLOGICAL_TEST_FIXTURE') {
    acquiredRecords = buildMethodologicalTestFixture(dataset, region, startDate, endDate);
    stages.push({
      stage: '1. Data Acquisition',
      status: 'WARNING',
      summary: `Generated ${acquiredRecords.length} explicitly tagged non-observational fixture steps (METHODOLOGICAL_TEST_FIXTURE) to exercise statistical formulas without NASA Earthdata credentials.`,
      metrics: { fixtureSteps: acquiredRecords.length, isRealObservation: false },
    });
    message = `Executed methodological validation fixture (${acquiredRecords.length} steps). Clearly separated from real NASA observations.`;
  } else {
    const connectorRes = await acquireNasaDatasetForRegion({
      dataset,
      region,
      startDate,
      endDate,
      probeCmr: true,
    });
    cmrDiscovery = connectorRes.cmrDiscovery;
    opendapRequestTemplate = connectorRes.opendapRequestTemplate;
    configurationSteps = connectorRes.configurationSteps;
    acquiredRecords = connectorRes.records;
    message = connectorRes.message;

    if (connectorRes.status !== 'CONNECTED_LIVE' || acquiredRecords.length === 0) {
      effectiveProvenance = 'PENDING_CONFIGURATION';
      stages.push({
        stage: '1. Data Acquisition',
        status: 'PENDING_CONFIGURATION',
        summary: connectorRes.message,
        metrics: {
          cmrReachable: cmrDiscovery?.liveReachable ?? false,
          cmrGranuleHits: cmrDiscovery?.granuleHits ?? 0,
          earthdataTokenConfigured: connectorRes.earthdataTokenConfigured,
        },
      });
    } else {
      stages.push({
        stage: '1. Data Acquisition',
        status: 'COMPLETED',
        summary: connectorRes.message,
        metrics: { rawRows: acquiredRecords.length },
      });
    }
  }

  // If acquisition returned no series (PENDING_CONFIGURATION), persist run honestly and return immediately
  if (acquiredRecords.length === 0) {
    const nowIso = new Date().toISOString();
    db.prepare(`
      INSERT INTO pipeline_runs (
        id, dataset_id, region_id, start_date, end_date, temporal_aggregation,
        provenance_type, status, query_hash, records_ingested, valid_records,
        missing_periods, stage_report_json, diagnostics_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, ?)
    `).run(
      runId,
      dataset.id,
      region.id,
      startDate,
      endDate,
      temporalAggregation,
      'PENDING_CONFIGURATION',
      'PENDING_CONFIGURATION',
      queryHash,
      JSON.stringify(stages),
      JSON.stringify({ cmrDiscovery, spatialAssessment, opendapRequestTemplate }),
      nowIso
    );

    return {
      runId,
      queryHash,
      cached: false,
      dataset,
      region,
      provenanceType: 'PENDING_CONFIGURATION',
      isRealObservation: false,
      status: 'PENDING_CONFIGURATION',
      temporalAggregation,
      startDate,
      endDate,
      cmrDiscovery,
      opendapRequestTemplate,
      configurationSteps,
      spatialAssessment,
      stages,
      series: [],
      trendReport: null,
      message,
    };
  }

  // STAGE 2: VALIDATION (Date range filter & deduplication)
  const filteredByDate = acquiredRecords
    .filter((r) => r.obsDate >= startDate.slice(0, 7) + '-01' && r.obsDate <= endDate.slice(0, 7) + '-01')
    .sort((a, b) => a.obsDate.localeCompare(b.obsDate));
  const byMonthMap = new Map<string, RawAcquiredRecord>();
  for (const r of filteredByDate) {
    byMonthMap.set(r.obsDate, r);
  }
  stages.push({
    stage: '2. Validation',
    status: 'COMPLETED',
    summary: `Validated ${byMonthMap.size} unique monthly timestamps inside [${startDate}, ${endDate}].`,
    metrics: { validatedMonths: byMonthMap.size },
  });

  // STAGE 3 & 4: QUALITY FILTERING & MISSING-DATA HANDLING (Zero silent imputation)
  const expectedMonths = buildExpectedMonthGrid(startDate, endDate);
  let validCount = 0;
  let missingCount = 0;

  const fullMonthlySeries = expectedMonths.map((grid) => {
    const rec = byMonthMap.get(grid.obsDate);
    if (!rec || rec.rawValue === null || !Number.isFinite(rec.rawValue)) {
      missingCount += 1;
      return {
        obsDate: grid.obsDate,
        year: grid.year,
        month: grid.month,
        rawValue: null,
        rawUnit: dataset.nativeUnit,
        normalizedValue: null,
        normalizedUnit: dataset.normalizedUnit,
        uncertainty: null,
        qualityFlag: rec?.qualityFlag || 'MISSING_OBSERVATION',
        isMissing: true,
        sourceGranuleRef: rec?.sourceGranuleRef || 'GAP_UNOBSERVED',
      };
    }

    validCount += 1;
    // STAGE 7 (applied per valid datum): UNIT NORMALIZATION
    const normalizedValue = normalizeUnitValue(
      dataset,
      rec.rawValue,
      grid.year,
      grid.month,
      Boolean(params.importedAlreadyNormalized)
    );
    return {
      obsDate: grid.obsDate,
      year: grid.year,
      month: grid.month,
      rawValue: rec.rawValue,
      rawUnit: dataset.nativeUnit,
      normalizedValue,
      normalizedUnit: dataset.normalizedUnit,
      uncertainty: rec.uncertainty ?? null,
      qualityFlag: rec.qualityFlag,
      isMissing: false,
      sourceGranuleRef: rec.sourceGranuleRef,
    };
  });

  stages.push({
    stage: '3. Quality Filtering',
    status: 'COMPLETED',
    summary: `Applied ${dataset.qualityFlags} screening; retained ${validCount} valid records.`,
    metrics: { validRecords: validCount },
  });

  stages.push({
    stage: '4. Missing-Data Handling',
    status: missingCount > 0 ? 'WARNING' : 'COMPLETED',
    summary: `Preserved ${missingCount} missing months out of ${expectedMonths.length} expected steps without fabricating values.`,
    metrics: {
      expectedSteps: expectedMonths.length,
      missingPeriods: missingCount,
      coveragePct: expectedMonths.length > 0 ? Number(((validCount / expectedMonths.length) * 100).toFixed(1)) : 0,
    },
  });

  // STAGE 5: SPATIAL AGGREGATION & RESOLUTION PRESERVATION
  stages.push({
    stage: '5. Spatial Aggregation',
    status: spatialAssessment.footprintExceedsRegion ? 'WARNING' : 'COMPLETED',
    summary:
      spatialAssessment.scaleWarningEn ||
      `Aggregated native ${dataset.spatialResolution} grid across ${region.nameEn} bounding box [${region.minLat}..${region.maxLat}, ${region.minLon}..${region.maxLon}].`,
    metrics: {
      nativeFootprintKm: spatialAssessment.nativeFootprintKm,
      regionSpanLatKm: spatialAssessment.regionSpanLatKm,
      regionSpanLonKm: spatialAssessment.regionSpanLonKm,
    },
  });

  // STAGE 6: TEMPORAL AGGREGATION
  const aggregatedSeries = aggregateTemporally(fullMonthlySeries, temporalAggregation);
  stages.push({
    stage: '6. Temporal Aggregation',
    status: 'COMPLETED',
    summary: `Aggregated series at '${temporalAggregation}' cadence (${aggregatedSeries.length} time steps).`,
    metrics: { cadence: temporalAggregation, steps: aggregatedSeries.length },
  });

  // STAGE 7: UNIT NORMALIZATION REPORT
  stages.push({
    stage: '7. Unit Normalization',
    status: 'COMPLETED',
    summary: `Normalized values using rule: ${dataset.normalizationFormula}.`,
    metrics: { rawUnit: dataset.nativeUnit, normalizedUnit: dataset.normalizedUnit },
  });

  // Run Statistical Trend Engine
  const trendReport = analyzeTimeSeriesTrends(aggregatedSeries, dataset.normalizedUnit, {
    expectedSteps: temporalAggregation === 'monthly' ? expectedMonths.length : aggregatedSeries.length,
  });

  const finalStatus: ScientificPipelineExecutionResult['status'] =
    trendReport.status === 'INSUFFICIENT_DATA' ? 'INSUFFICIENT_DATA' : 'COMPLETED';

  // STAGE 8: PROVENANCE PERSISTENCE (SQLite)
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO pipeline_runs (
      id, dataset_id, region_id, start_date, end_date, temporal_aggregation,
      provenance_type, status, query_hash, records_ingested, valid_records,
      missing_periods, stage_report_json, diagnostics_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runId,
    dataset.id,
    region.id,
    startDate,
    endDate,
    temporalAggregation,
    effectiveProvenance,
    finalStatus,
    queryHash,
    fullMonthlySeries.length,
    validCount,
    missingCount,
    JSON.stringify(stages),
    JSON.stringify({
      trendStatus: trendReport.status,
      coveragePct: trendReport.diagnostics.coveragePct,
      spatialAssessment,
    }),
    nowIso
  );

  const insertObs = db.prepare(`
    INSERT INTO scientific_observations (
      run_id, region_id, dataset_id, variable_key, obs_date, year, month,
      raw_value, raw_unit, normalized_value, normalized_unit, uncertainty,
      quality_flag, is_missing, native_spatial_resolution, provenance_type,
      source_granule_ref, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const pt of fullMonthlySeries) {
    insertObs.run(
      runId,
      region.id,
      dataset.id,
      dataset.variableKey,
      pt.obsDate,
      pt.year,
      pt.month,
      pt.rawValue,
      pt.rawUnit,
      pt.normalizedValue,
      pt.normalizedUnit,
      pt.uncertainty,
      pt.qualityFlag,
      pt.isMissing ? 1 : 0,
      dataset.spatialResolution,
      effectiveProvenance,
      pt.sourceGranuleRef,
      nowIso
    );
  }

  stages.push({
    stage: '8. Provenance & Persistence',
    status: 'COMPLETED',
    summary: `Stored run ${runId} and ${fullMonthlySeries.length} records in SQLite with provenance '${effectiveProvenance}'.`,
  });

  // STAGE 9: CACHING & REPRODUCIBILITY
  const payloadForCache = {
    runId,
    queryHash,
    trendReport,
    spatialAssessment,
    series: fullMonthlySeries,
  };
  db.prepare(`
    INSERT INTO trend_analysis_cache (query_hash, dataset_id, region_id, provenance_type, result_json, computed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(query_hash) DO UPDATE SET
      provenance_type = excluded.provenance_type,
      result_json = excluded.result_json,
      computed_at = excluded.computed_at
  `).run(queryHash, dataset.id, region.id, effectiveProvenance, JSON.stringify(payloadForCache), nowIso);

  stages.push({
    stage: '9. Caching & Reproducibility',
    status: 'COMPLETED',
    summary: `Indexed deterministic reproducibility hash ${queryHash}.`,
    metrics: { queryHash },
  });

  recordAuditLog({
    requestId: params.requestId || 'science-pipeline',
    actor: 'trend-detective-pipeline',
    action: 'SCIENTIFIC_PIPELINE_RUN',
    resourceType: 'pipeline_run',
    resourceId: runId,
    metadata: {
      datasetId: dataset.id,
      regionId: region.id,
      provenanceType: effectiveProvenance,
      trendStatus: trendReport.status,
      queryHash,
    },
  });

  return {
    runId,
    queryHash,
    cached: false,
    dataset,
    region,
    provenanceType: effectiveProvenance,
    isRealObservation: effectiveProvenance === 'LIVE_NASA_EARTHDATA' || effectiveProvenance === 'IMPORTED_OBSERVATIONS',
    status: finalStatus,
    temporalAggregation,
    startDate,
    endDate,
    cmrDiscovery,
    opendapRequestTemplate,
    configurationSteps,
    spatialAssessment,
    stages,
    series: fullMonthlySeries,
    trendReport,
    message,
  };
}

export async function compareAllRegionsForDataset(params: {
  datasetId: ScientificDatasetSpec['id'];
  startDate?: string;
  endDate?: string;
  temporalAggregation?: TemporalAggregationMode;
  mode?: ProvenanceMode;
  requestId?: string;
}) {
  const regions = listStudyRegionsFromDb();
  const regionResults = await Promise.all(
    regions.map((reg) =>
      runScientificPipeline({
        datasetId: params.datasetId,
        regionId: reg.id,
        startDate: params.startDate,
        endDate: params.endDate,
        temporalAggregation: params.temporalAggregation,
        mode: params.mode,
        requestId: params.requestId,
      })
    )
  );

  // Also check if there are any previously imported real observations stored per region in SQLite
  const storedSummary = regions.map((r) => {
    const row = db
      .prepare(
        `SELECT provenance_type, COUNT(*) as total, SUM(CASE WHEN is_missing = 0 THEN 1 ELSE 0 END) as valid
         FROM scientific_observations
         WHERE region_id = ? AND dataset_id = ? AND provenance_type != 'METHODOLOGICAL_TEST_FIXTURE'
         GROUP BY provenance_type
         ORDER BY MAX(id) DESC LIMIT 1`
      )
      .get(r.id, params.datasetId) as { provenance_type: string; total: number; valid: number } | undefined;
    return {
      regionId: r.id,
      hasPersistedRealOrImportedData: Boolean(row && row.valid > 0),
      persistedProvenance: row?.provenance_type || null,
      persistedValidCount: row?.valid || 0,
    };
  });

  return {
    dataset: SCIENTIFIC_DATASETS.find((d) => d.id === params.datasetId),
    regionsCount: regionResults.length,
    persistedObservationsSummary: storedSummary,
    regionalAnalyses: regionResults,
  };
}
