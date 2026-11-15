export type CoreStudyRegionId = 'nile-delta-north' | 'greater-cairo' | 'upper-egypt-agro';

export interface StudyRegionPreset {
  id: CoreStudyRegionId;
  code: string;
  labelEn: string;
  labelAr: string;
  searchQuery: string;
  lat: number;
  lon: number;
}

export const STUDY_REGION_PRESETS: Record<CoreStudyRegionId, StudyRegionPreset> = {
  'nile-delta-north': {
    id: 'nile-delta-north',
    code: 'EG-DELTA-N',
    labelEn: 'Northern Nile Delta',
    labelAr: 'شمال دلتا النيل',
    searchQuery: 'Kafr El-Sheikh',
    lat: 31.22,
    lon: 30.88,
  },
  'greater-cairo': {
    id: 'greater-cairo',
    code: 'EG-CAIRO-METRO',
    labelEn: 'Greater Cairo Basin',
    labelAr: 'حوض القاهرة الكبرى',
    searchQuery: 'Cairo',
    lat: 30.0444,
    lon: 31.2357,
  },
  'upper-egypt-agro': {
    id: 'upper-egypt-agro',
    code: 'EG-UPPER-AGRO',
    labelEn: 'Upper Egypt Corridor',
    labelAr: 'الممر الزراعي بالصعيد',
    searchQuery: 'Minya',
    lat: 27.72,
    lon: 30.82,
  },
};

export interface LocationTelemetrySnapshot {
  regionId?: string;
  location: {
    name: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
  coordinates: {
    lat: number;
    lon: number;
  };
  current: {
    temperatureC: number;
    apparentTemperatureC: number | null;
    humidityPct: number;
    windSpeedKmh: number;
    precipitationMm: number;
    dailyPrecipitationMm: number;
    soilMoistureM3M3: number | null;
    soilMoistureKgM2: number | null;
    weatherCode: number;
    conditionEn: string;
    conditionAr: string;
    isDay: boolean;
    observedAt: string;
  };
  climateRisk?: {
    compositeRiskScore: number;
    riskTier: string;
    coastalExposureScore?: number;
    urbanHeatScore?: number;
    waterStressScore?: number;
  };
  source: string;
}

export interface DailyForecastItem {
  date: string;
  weatherCode: number;
  conditionEn: string;
  conditionAr: string;
  tempMinC: number;
  tempMaxC: number;
  precipProbPct: number;
  windMaxKmh: number;
}

export interface WeeklyForecastSnapshot {
  regionId?: string;
  coordinates: { lat: number; lon: number };
  timezone: string;
  days: DailyForecastItem[];
  source: string;
}

export interface ScienceDatasetMeta {
  id: 'merra-2' | 'gpm-imerg' | 'gldas' | 'grace-fo';
  productId: string;
  cmrCollectionConceptId: string;
  spatialResolution: string;
  temporalResolution: string;
  normalizedUnit: string;
  normalizationFormula: string;
}

export interface ConnectorStatusMeta {
  id: string;
  cmrIndexed?: boolean;
  tokenConfigured?: boolean;
  mode?: string;
}

export interface StudyRegionCatalogMeta {
  id: string;
  nameEn: string;
  nameAr: string;
  centerLat: number;
  centerLon: number;
  approxAreaKm2: number;
  primaryClimateStressorsEn: string;
  primaryClimateStressorsAr: string;
}

export interface ScienceOverviewSnapshot {
  datasets: ScienceDatasetMeta[];
  connectorStatus: ConnectorStatusMeta[];
  regions: StudyRegionCatalogMeta[];
}

export class TelemetryApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'TelemetryApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new TelemetryApiError(
        res.status,
        'INVALID_JSON_RESPONSE',
        `Upstream endpoint returned malformed payload (HTTP ${res.status}).`
      );
    }
  }

  if (!res.ok) {
    const errPayload = parsed as { error?: { code?: string; message?: string }; message?: string } | null;
    throw new TelemetryApiError(
      res.status,
      errPayload?.error?.code || `HTTP_${res.status}`,
      errPayload?.error?.message || errPayload?.message || `Telemetry request failed (HTTP ${res.status}).`
    );
  }

  return parsed as T;
}

export async function fetchLocationTelemetry(opts: {
  query?: string;
  regionId?: CoreStudyRegionId;
  lat?: number;
  lon?: number;
  signal?: AbortSignal;
}): Promise<LocationTelemetrySnapshot> {
  const params = new URLSearchParams();
  if (opts.regionId) {
    params.set('regionId', opts.regionId);
  } else if (opts.query && opts.query.trim()) {
    params.set('q', opts.query.trim());
  } else if (typeof opts.lat === 'number' && typeof opts.lon === 'number') {
    params.set('lat', String(opts.lat));
    params.set('lon', String(opts.lon));
  }

  const res = await fetch(`/api/weather/current?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: opts.signal,
  });

  return parseJsonResponse<LocationTelemetrySnapshot>(res);
}

export async function fetchWeeklyForecast(opts: {
  regionId?: CoreStudyRegionId;
  lat?: number;
  lon?: number;
  signal?: AbortSignal;
}): Promise<WeeklyForecastSnapshot> {
  const params = new URLSearchParams();
  if (opts.regionId) {
    params.set('regionId', opts.regionId);
  } else if (typeof opts.lat === 'number' && typeof opts.lon === 'number') {
    params.set('lat', String(opts.lat));
    params.set('lon', String(opts.lon));
  } else {
    params.set('regionId', 'nile-delta-north');
  }

  const res = await fetch(`/api/weather/forecast?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: opts.signal,
  });

  return parseJsonResponse<WeeklyForecastSnapshot>(res);
}

export async function fetchScienceOverview(signal?: AbortSignal): Promise<ScienceOverviewSnapshot> {
  const res = await fetch('/api/science/overview', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });
  return parseJsonResponse<ScienceOverviewSnapshot>(res);
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
