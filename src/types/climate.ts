export type Language = 'en' | 'ar';

export type PageRoute =
  | 'landing'
  | 'detective'
  | 'research'
  | 'modules'
  | 'sectors'
  | 'dashboard'
  | 'workspaces'
  | 'reports'
  | 'alerts'
  | 'api'
  | 'pricing'
  | 'contact';

export type ModuleId =
  | 'delta-risk'
  | 'crop-health'
  | 'urban-heat'
  | 'air-dust'
  | 'esg-reporting'
  | 'water-monitoring'
  | 'trend-alerts';

export type SectorId =
  | 'real-estate'
  | 'banking'
  | 'investment'
  | 'agriculture'
  | 'exporting'
  | 'irrigation'
  | 'government'
  | 'municipalities'
  | 'insurance'
  | 'healthcare'
  | 'tourism'
  | 'sustainability';

export interface BilingualText {
  en: string;
  ar: string;
}

export interface ModuleSpec {
  id: ModuleId;
  index: string;
  title: BilingualText;
  shortTitle: BilingualText;
  tagline: BilingualText;
  description: BilingualText;
  mechanism: BilingualText;
  outcome: BilingualText;
  satelliteSources: string[];
  primaryVariables: BilingualText;
  targetSectors: SectorId[];
  sampleHighlight: {
    label: BilingualText;
    value: string;
    unit: string;
    context: BilingualText;
  };
  imagePath: string;
}

export interface SectorSpec {
  id: SectorId;
  title: BilingualText;
  summary: BilingualText;
  keyModules: ModuleId[];
  decisionWorkflow: BilingualText;
  complianceFocus: BilingualText;
  deliverable: BilingualText;
}

export interface AoiLocation {
  id: string;
  workspace_id: string;
  name_en: string;
  name_ar: string;
  lat: number;
  lon: number;
  radius_km: number;
  region_code: string;
  primary_module: ModuleId;
}

export interface WorkspaceRecord {
  id: string;
  name_en: string;
  name_ar: string;
  sector: string;
  plan_tier: string;
  aoi_limit: number;
  owner_role_en: string;
  owner_role_ar: string;
  active_modules: string;
  created_at: string;
}

export interface SampleObservation {
  id: number;
  aoi_id: string;
  aoi_name_en: string;
  aoi_name_ar: string;
  lat: number;
  lon: number;
  workspace_id: string;
  module_id: ModuleId;
  source_name: string;
  period_label: string;
  metric_key: string;
  metric_value: number;
  unit: string;
  baseline_value: number;
  anomaly_delta: number;
  is_sample_data: number;
  data_provenance: string;
}

export interface SatelliteConnector {
  id: string;
  source_name: string;
  agency: string;
  temporal_cadence: string;
  spatial_resolution: string;
  primary_variables: string;
  mapped_modules: string;
  integration_stage: string;
  data_provenance_status: string;
  ingestion_format: string;
  required_env_var: string;
  endpoint_template: string;
  credentialsConfigured: boolean;
}

export interface TrendAlert {
  id: string;
  workspace_id: string;
  title_en: string;
  title_ar: string;
  module_id: ModuleId;
  lat: number;
  lon: number;
  radius_km: number;
  metric_key: string;
  operator: string;
  threshold_value: number;
  unit: string;
  severity: string;
  channel: string;
  enabled: number;
  last_evaluated_at: string;
  created_at: string;
}

export interface ReportRecord {
  id: string;
  workspace_id: string;
  organization_name: string;
  sector: string;
  standard: string;
  module_ids: string;
  lat: number;
  lon: number;
  report_type: string;
  status: string;
  data_provenance: string;
  created_at: string;
}

export type ScienceDatasetId = 'merra-2' | 'gpm-imerg' | 'gldas' | 'grace-fo';
export type StudyRegionId = 'nile-delta-north' | 'greater-cairo' | 'upper-egypt-agro';
export type ProvenanceMode =
  | 'LIVE_NASA_EARTHDATA'
  | 'IMPORTED_OBSERVATIONS'
  | 'METHODOLOGICAL_TEST_FIXTURE';
export type TemporalAggregationMode = 'monthly' | 'seasonal' | 'annual';

export interface StudyRegion {
  id: StudyRegionId;
  nameEn: string;
  nameAr: string;
  classificationEn: string;
  classificationAr: string;
  centerLat: number;
  centerLon: number;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  approxAreaKm2: number;
  selectionRationaleEn: string;
  selectionRationaleAr: string;
  primaryClimateStressorsEn: string;
  primaryClimateStressorsAr: string;
  isDefault: boolean;
}

export interface ScientificDataset {
  id: ScienceDatasetId;
  variableKey: string;
  variableNameEn: string;
  variableNameAr: string;
  datasetName: string;
  productId: string;
  productVersion: string;
  targetVariableField: string;
  agency: string;
  documentationUrl: string;
  cmrShortName: string;
  cmrCollectionConceptId: string;
  accessMethod: string;
  endpointTemplate: string;
  requiredEnvVar: string;
  temporalResolution: string;
  spatialResolution: string;
  nativeFootprintKm: number;
  nativeUnit: string;
  normalizedUnit: string;
  normalizationFormula: string;
  coveragePeriod: string;
  qualityFlags: string;
  licensing: string;
  scaleLimitationEn: string;
  scaleLimitationAr: string;
}

export interface ResearchSourceItem {
  id: string;
  titleEn: string;
  titleAr: string;
  url: string;
  organization: string;
  classification:
    | 'Operational data source'
    | 'Data discovery or processing tool'
    | 'Research or methodology reference'
    | 'Supporting satellite mission or documentation';
  descriptionEn: string;
  descriptionAr: string;
  relevanceEn: string;
  relevanceAr: string;
  integrationStatus: string;
  lastProbeStatus: number | null;
  lastProbedAt: string | null;
  probeNote: string | null;
}

export interface TrendReportPayload {
  status: 'SIGNIFICANT_TREND' | 'NO_SIGNIFICANT_TREND' | 'INSUFFICIENT_DATA';
  insufficientReason: string | null;
  diagnostics: {
    totalExpectedSteps: number;
    validObservations: number;
    missingObservations: number;
    coveragePct: number;
    minimumRequiredSamples: number;
    minimumRequiredCoveragePct: number;
    timeSpanYears: number;
    startDate: string | null;
    endDate: string | null;
    tieGroupsCount: number;
    lag1Autocorrelation: number | null;
    effectiveSampleSize: number | null;
    autocorrelationConcern: boolean;
  };
  mannKendall: {
    sStatistic: number | null;
    varianceS: number | null;
    zScore: number | null;
    pValueTwoSided: number | null;
    modifiedVarianceS: number | null;
    modifiedZScore: number | null;
    modifiedPValueTwoSided: number | null;
    isSignificantAlpha05: boolean;
    isSignificantAfterAutocorr05: boolean;
    trendDirection: 'INCREASING' | 'DECREASING' | 'NO_TREND' | 'UNDETERMINED';
  };
  theilSen: {
    slopePerYear: number | null;
    slopePerDecade: number | null;
    interceptAtStart: number | null;
    ci95LowerPerYear: number | null;
    ci95UpperPerYear: number | null;
    pairwiseSlopeCount: number;
    unitPerYear: string;
  };
  summaryStats: {
    mean: number | null;
    median: number | null;
    stdDev: number | null;
    min: number | null;
    max: number | null;
  };
  seasonalBreakdown: Array<{
    season: 'DJF' | 'MAM' | 'JJA' | 'SON';
    labelEn: string;
    labelAr: string;
    sampleCount: number;
    validYears: number;
    status: 'COMPUTED' | 'INSUFFICIENT_DATA';
    mannKendallS: number | null;
    mannKendallZ: number | null;
    pValue: number | null;
    isSignificant05: boolean;
    theilSenSlopePerYear: number | null;
    ci95LowerPerYear: number | null;
    ci95UpperPerYear: number | null;
    note: string;
  }>;
  methodologicalLimitationsEn: string[];
  methodologicalLimitationsAr: string[];
}

export interface ScientificPipelineResult {
  runId: string;
  queryHash: string;
  cached: boolean;
  dataset: ScientificDataset;
  region: StudyRegion;
  provenanceType: ProvenanceMode | 'PENDING_CONFIGURATION';
  isRealObservation: boolean;
  status: 'COMPLETED' | 'PENDING_CONFIGURATION' | 'INSUFFICIENT_DATA';
  temporalAggregation: TemporalAggregationMode;
  startDate: string;
  endDate: string;
  cmrDiscovery: {
    datasetId: string;
    cmrShortName: string;
    conceptId: string;
    liveReachable: boolean;
    httpStatus: number | null;
    matchedCollectionTitle?: string;
    temporalExtent?: string;
    granuleHits?: number;
    sampleGranuleIds: string[];
    queryUrl: string;
    checkedAt: string;
    errorMessage?: string;
  } | null;
  opendapRequestTemplate: string;
  configurationSteps: string[];
  spatialAssessment: {
    nativeResolution: string;
    nativeFootprintKm: number;
    regionSpanLatKm: number;
    regionSpanLonKm: number;
    regionAreaKm2: number;
    footprintExceedsRegion: boolean;
    scaleWarningEn: string | null;
    scaleWarningAr: string | null;
  };
  stages: Array<{
    stage: string;
    status: 'COMPLETED' | 'PENDING_CONFIGURATION' | 'WARNING';
    summary: string;
    metrics?: Record<string, unknown>;
  }>;
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
  trendReport: TrendReportPayload | null;
  message: string;
}

