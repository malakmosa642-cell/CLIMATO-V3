import { db } from '../db/database.ts';

export interface SatelliteConnectorRow {
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
}

export interface StagedIngestionResult {
  connectorId: string;
  sourceName: string;
  agency: string;
  spatialProjection: 'EPSG:4326';
  coordinates: { lat: number; lon: number };
  isSampleData: true;
  dataProvenance: 'SAMPLE_DEMONSTRATION';
  liveIntegrationReady: boolean;
  connectorHealth: 'STAGED_SANDBOX_ACTIVE' | 'LIVE_CREDENTIALS_DETECTED';
  requiredEnvVar: string;
  credentialsConfigured: boolean;
  notice: string;
  samplePayload: {
    variable: string;
    value: number;
    unit: string;
    period: string;
  };
}

export function listSatelliteConnectors(): Array<
  SatelliteConnectorRow & {
    credentialsConfigured: boolean;
    connectorHealth: 'STAGED_SANDBOX_ACTIVE' | 'LIVE_CREDENTIALS_DETECTED';
    spatialProjection: 'EPSG:4326';
  }
> {
  const rows = db
    .prepare('SELECT * FROM satellite_connectors ORDER BY id ASC')
    .all() as unknown as SatelliteConnectorRow[];

  return rows.map((row) => {
    const configured =
      row.required_env_var === 'NASA_POWER_PUBLIC_ENDPOINT'
        ? false
        : Boolean(process.env[row.required_env_var]);
    return {
      ...row,
      credentialsConfigured: configured,
      connectorHealth: configured ? 'LIVE_CREDENTIALS_DETECTED' : 'STAGED_SANDBOX_ACTIVE',
      spatialProjection: 'EPSG:4326',
    };
  });
}

/**
 * Staged ingestion architecture entry point.
 * Clearly separates verified live satellite pipelines (requiring configured agency credentials
 * and spatial granule ingestion workers) from clearly labeled SAMPLE_DEMONSTRATION outputs.
 */
export function executeStagedPreview(
  connectorId: string,
  lat: number,
  lon: number
): StagedIngestionResult | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new Error('Invalid WGS84 coordinates supplied to connector preview.');
  }

  const row = db
    .prepare('SELECT * FROM satellite_connectors WHERE id = ?')
    .get(connectorId) as unknown as SatelliteConnectorRow | undefined;

  if (!row) return null;

  const credentialsConfigured =
    row.required_env_var === 'NASA_POWER_PUBLIC_ENDPOINT'
      ? false
      : Boolean(process.env[row.required_env_var]);

  // Deterministic sample preview derived solely from coordinate hash for demonstration
  const seed = Math.abs(Math.sin(lat * 12.9898 + lon * 78.233) * 43758.5453) % 1;

  const variableMap: Record<string, { variable: string; min: number; max: number; unit: string }> = {
    'sentinel-6': { variable: 'sea_surface_height_anomaly', min: 15, max: 52, unit: 'mm' },
    modis: { variable: 'ndvi_16d_composite', min: 0.18, max: 0.78, unit: 'index' },
    landsat: { variable: 'surface_temp_b10', min: 24, max: 44, unit: '°C' },
    smap: { variable: 'root_zone_soil_moisture', min: 0.08, max: 0.36, unit: 'm³/m³' },
    gpm: { variable: 'imerg_monthly_precip', min: 2, max: 68, unit: 'mm' },
    tropomi: { variable: 'no2_tropospheric_column', min: 12, max: 96, unit: 'µmol/m²' },
    'merra-2': { variable: 'dust_column_mass_density', min: 0.12, max: 0.85, unit: 'g/m²' },
    ecostress: { variable: 'evaporative_stress_index', min: -1.4, max: 1.1, unit: 'ESI' },
    'grace-fo': { variable: 'lwe_thickness_anomaly', min: -14, max: 6, unit: 'cm' },
    'nasa-power': { variable: 'allsky_sfc_sw_dwn', min: 4.1, max: 7.4, unit: 'kWh/m²/day' },
  };

  const spec = variableMap[row.id] ?? { variable: 'climate_index', min: 0, max: 100, unit: 'pts' };
  const value = Number((spec.min + seed * (spec.max - spec.min)).toFixed(2));

  return {
    connectorId: row.id,
    sourceName: row.source_name,
    agency: row.agency,
    spatialProjection: 'EPSG:4326',
    coordinates: { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)) },
    isSampleData: true,
    dataProvenance: 'SAMPLE_DEMONSTRATION',
    liveIntegrationReady: row.integration_stage === 'STAGED_ADAPTER_READY',
    connectorHealth: credentialsConfigured ? 'LIVE_CREDENTIALS_DETECTED' : 'STAGED_SANDBOX_ACTIVE',
    requiredEnvVar: row.required_env_var,
    credentialsConfigured,
    notice:
      'SAMPLE DEMONSTRATION OUTPUT: Live satellite granule ingestion requires staging worker activation and agency credentials.',
    samplePayload: {
      variable: spec.variable,
      value,
      unit: spec.unit,
      period: '2026-Q4 (Sample Baseline)',
    },
  };
}
