import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_STUDY_REGIONS,
  RESEARCH_SOURCES,
  SCIENTIFIC_DATASETS,
} from '../data/scientificCatalog.ts';
import {
  getMigrationStatus,
  hashApiToken,
  maskApiToken,
  runMigrations,
} from './migrations.ts';

function resolveDbPath(overridePath?: string): string {
  const configured = overridePath || process.env.CLIMATO_DB_PATH?.trim();
  if (configured) {
    if (configured === ':memory:') return ':memory:';
    const abs = path.resolve(configured);
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return abs;
  }
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'terrapulse.db');
}

let activeDbPath = resolveDbPath();
export let db = new DatabaseSync(activeDbPath);

export function getActiveDbPath(): string {
  return activeDbPath;
}

export function getDatabaseMigrationStatus() {
  return getMigrationStatus(db);
}

export function initDatabase(customDbPath?: string) {
  if (customDbPath && customDbPath !== activeDbPath) {
    try {
      db.close();
    } catch {
      // ignore if already closed
    }
    activeDbPath = resolveDbPath(customDbPath);
    db = new DatabaseSync(activeDbPath);
  }

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);

  const migrationResult = runMigrations(db);
  seedInitialData();
  return migrationResult;
}

export function recordAuditLog(params: {
  requestId: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
}) {
  const id = `aud-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  db.prepare(`
    INSERT INTO audit_logs (id, request_id, actor, action, resource_type, resource_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.requestId,
    params.actor,
    params.action,
    params.resourceType,
    params.resourceId,
    JSON.stringify(params.metadata ?? {}),
    new Date().toISOString()
  );
}

function seedInitialData() {
  const existingConnectors = db.prepare('SELECT COUNT(*) as count FROM satellite_connectors').get() as { count: number };
  if (existingConnectors.count === 0) {
    const insertConnector = db.prepare(`
      INSERT INTO satellite_connectors (
        id, source_name, agency, temporal_cadence, spatial_resolution,
        primary_variables, mapped_modules, integration_stage,
        data_provenance_status, ingestion_format, required_env_var, endpoint_template
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const connectors = [
      ['sentinel-6', 'Sentinel-6 Michael Freilich', 'EUMETSAT / ESA / NASA', '10-day repeat cycle', '300 m along-track', 'Sea Surface Height Anomaly, Significant Wave Height', 'delta-risk,water-monitoring', 'STAGED_ADAPTER_READY', 'SAMPLE_SANDBOX', 'NetCDF4 / CF-1.8', 'COPERNICUS_DATA_SPACE_TOKEN', 'https://catalogue.dataspace.copernicus.eu/odata/v1/Products'],
      ['modis', 'MODIS Terra & Aqua', 'NASA EOSDIS', 'Daily / 8-day composite', '250 m – 1 km', 'NDVI, EVI, Aerosol Optical Depth, Land Surface Temp', 'crop-health,urban-heat,air-dust', 'STAGED_ADAPTER_READY', 'SAMPLE_SANDBOX', 'HDF-EOS / COG GeoTIFF', 'NASA_EARTHDATA_TOKEN', 'https://cmr.earthdata.nasa.gov/search/granules.json'],
      ['landsat', 'Landsat 8 & 9 OLI/TIRS', 'USGS / NASA', '8-day combined revisit', '30 m optical / 100 m thermal', 'Surface Reflectance, Coastal Shoreline, Thermal IR', 'delta-risk,crop-health,urban-heat,water-monitoring', 'STAGED_ADAPTER_READY', 'SAMPLE_SANDBOX', 'STAC / COG GeoTIFF', 'USGS_EROS_M2M_TOKEN', 'https://landsatlook.usgs.gov/stac-server/search'],
      ['smap', 'SMAP L-Band Radiometer', 'NASA JPL', '2–3 days global', '9 km / 3 km enhanced', 'Surface & Root-Zone Soil Moisture, Freeze/Thaw', 'crop-health,water-monitoring,delta-risk', 'STAGED_ADAPTER_READY', 'SAMPLE_SANDBOX', 'HDF5 / GeoTIFF', 'NASA_EARTHDATA_TOKEN', 'https://n5eil01u.ecs.nsidc.org/SMAP/'],
      ['gpm', 'GPM IMERG Precipitation', 'NASA / JAXA', '30-min / Daily', '0.1 deg (~10 km)', 'Precipitation Rate, Extreme Rainfall Accumulation', 'water-monitoring,delta-risk,trend-alerts', 'STAGED_ADAPTER_READY', 'SAMPLE_SANDBOX', 'NetCDF4 / Zarr', 'NASA_EARTHDATA_TOKEN', 'https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/'],
      ['tropomi', 'Sentinel-5P TROPOMI', 'ESA Copernicus', 'Daily global swath', '3.5 km × 5.5 km', 'NO2, SO2, CO, Methane, UV Aerosol Index', 'air-dust,esg-reporting,urban-heat', 'STAGED_ADAPTER_READY', 'SAMPLE_SANDBOX', 'NetCDF4 / STAC', 'COPERNICUS_DATA_SPACE_TOKEN', 'https://catalogue.dataspace.copernicus.eu/stac/search'],
      ['merra-2', 'MERRA-2 Reanalysis', 'NASA GMAO', 'Hourly / Monthly', '0.5° × 0.625°', 'Dust Column Mass, Boundary Layer Wind, Humidity', 'air-dust,trend-alerts,esg-reporting', 'STAGED_ADAPTER_READY', 'SAMPLE_SANDBOX', 'NetCDF4 / OPeNDAP', 'NASA_EARTHDATA_TOKEN', 'https://goldsmr4.gesdisc.eosdis.nasa.gov/opendap/MERRA2/'],
      ['ecostress', 'ECOSTRESS ISS Radiometer', 'NASA JPL', '3–5 days diurnal', '70 m × 70 m', 'Land Surface Temperature, Evaporative Stress Index', 'urban-heat,crop-health,water-monitoring', 'STAGED_ADAPTER_READY', 'SAMPLE_SANDBOX', 'HDF5 / Cloud GeoTIFF', 'NASA_EARTHDATA_TOKEN', 'https://appeears.earthdatacloud.nasa.gov/api/task'],
      ['grace-fo', 'GRACE-FO Gravimetry', 'NASA / GFZ', 'Monthly mascon', '~300 km basin scale', 'Terrestrial Water Storage, Groundwater Mass Anomaly', 'water-monitoring,delta-risk,esg-reporting', 'STAGED_ADAPTER_READY', 'SAMPLE_SANDBOX', 'NetCDF4 Mascon Grid', 'NASA_EARTHDATA_TOKEN', 'https://grace.jpl.nasa.gov/data/get-data/'],
      ['nasa-power', 'NASA POWER Agroclimatology', 'NASA LaRC', 'Daily / Climatology', '0.5° × 0.625°', 'Solar Irradiance, 2m Temp, Degree Days, Wind', 'crop-health,trend-alerts,esg-reporting', 'STAGED_ADAPTER_READY', 'SAMPLE_SANDBOX', 'REST JSON / CSV', 'NASA_POWER_PUBLIC_ENDPOINT', 'https://power.larc.nasa.gov/api/temporal/daily/point'],
    ];

    for (const c of connectors) {
      insertConnector.run(...c);
    }
  }

  const existingWorkspaces = db.prepare('SELECT COUNT(*) as count FROM workspaces').get() as { count: number };
  if (existingWorkspaces.count === 0) {
    const insertWs = db.prepare(`
      INSERT INTO workspaces (id, name_en, name_ar, sector, plan_tier, aoi_limit, owner_role_en, owner_role_ar, active_modules, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    insertWs.run('ws-delta-agro', 'Nile Delta Agro-Export Portfolio (Sample)', 'محفظة التصدير الزراعي بدلتا النيل (نموذج)', 'Agriculture & Exporting', 'Sector Pro Tier', 25, 'Agronomy & Export Risk Lead', 'مدير مخاطر الزراعة والتصدير', 'crop-health,water-monitoring,delta-risk,trend-alerts', now);
    insertWs.run('ws-coastal-banking', 'Coastal Real Estate & Credit Risk (Sample)', 'مخاطر العقارات الساحلية والائتمان (نموذج)', 'Banking & Real Estate', 'Enterprise & Sovereign', 100, 'Climate Underwriting Officer', 'مسؤول الاكتتاب والمخاطر المناخية', 'delta-risk,esg-reporting,urban-heat,trend-alerts', now);
    insertWs.run('ws-metro-municipality', 'Metropolitan Heat & Air Corridor (Sample)', 'ممر الحرارة وجودة الهواء الحضري (نموذج)', 'Municipalities & Healthcare', 'Enterprise & Sovereign', 100, 'Urban Resilience Director', 'مدير المرونة الحضرية والبلدية', 'urban-heat,air-dust,esg-reporting,trend-alerts', now);
    insertWs.run('ws-basin-irrigation', 'Regional Basin Irrigation & Tourism (Sample)', 'إدارة أحواض الري والسياحة الإقليمية (نموذج)', 'Irrigation & Tourism', 'Sector Pro Tier', 25, 'Hydrological Planning Analyst', 'محلل التخطيط الهيدرولوجي والري', 'water-monitoring,crop-health,air-dust,esg-reporting', now);

    const insertAoi = db.prepare(`
      INSERT INTO aoi_locations (id, workspace_id, name_en, name_ar, lat, lon, radius_km, region_code, primary_module)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAoi.run('aoi-rosetta', 'ws-delta-agro', 'Rosetta Coastal Perimeter (Sample)', 'النطاق الساحلي برشيد (نموذج)', 31.404, 30.416, 18, 'EG-DELTA-W', 'delta-risk');
    insertAoi.run('aoi-sharqia', 'ws-delta-agro', 'East Delta Citrus & Crop Belt (Sample)', 'حزام الموالح والمحاصيل بشرق الدلتا (نموذج)', 30.732, 31.719, 25, 'EG-DELTA-E', 'crop-health');
    insertAoi.run('aoi-cairo', 'ws-metro-municipality', 'Greater Cairo Thermal Corridor (Sample)', 'الممر الحراري للقاهرة الكبرى (نموذج)', 30.044, 31.235, 30, 'EG-CAI-MET', 'urban-heat');
    insertAoi.run('aoi-jubail', 'ws-coastal-banking', 'Gulf Industrial & Port Zone (Sample)', 'المنطقة الصناعية والميناء الخليجي (نموذج)', 27.011, 49.658, 22, 'SA-E-PORT', 'air-dust');
    insertAoi.run('aoi-toshka', 'ws-basin-irrigation', 'Upper Basin Pivot Irrigation Zone (Sample)', 'منطقة الري المحوري بالحوض العلوي (نموذج)', 22.912, 31.524, 35, 'EG-UPP-BAS', 'water-monitoring');
    insertAoi.run('aoi-alex', 'ws-coastal-banking', 'Alexandria Shoreline Assets (Sample)', 'الأصول الساحلية بالإسكندرية (نموذج)', 31.200, 29.918, 15, 'EG-ALX-CST', 'esg-reporting');

    const insertObs = db.prepare(`
      INSERT INTO sample_observations (aoi_id, module_id, source_name, period_label, metric_key, metric_value, unit, baseline_value, anomaly_delta, is_sample_data, data_provenance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'SAMPLE_DEMONSTRATION')
    `);

    const periods = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'];
    const sampleMatrix: Array<[string, string, string, string, number[], number, string]> = [
      ['aoi-rosetta', 'delta-risk', 'Sentinel-6 + Landsat', 'coastal_elevation_anomaly_mm', [38, 41, 44, 46], 32, 'mm'],
      ['aoi-sharqia', 'crop-health', 'MODIS + SMAP', 'ndvi_vigor_index', [0.64, 0.68, 0.59, 0.62], 0.66, 'index'],
      ['aoi-cairo', 'urban-heat', 'ECOSTRESS + Landsat TIRS', 'surface_temp_anomaly_c', [3.2, 4.6, 5.1, 3.8], 2.1, '°C'],
      ['aoi-jubail', 'air-dust', 'TROPOMI + MERRA-2', 'aerosol_optical_depth', [0.42, 0.58, 0.64, 0.45], 0.35, 'AOD'],
      ['aoi-toshka', 'water-monitoring', 'GRACE-FO + GPM', 'soil_moisture_index', [0.29, 0.24, 0.22, 0.27], 0.28, 'm³/m³'],
      ['aoi-alex', 'esg-reporting', 'Multi-Source Harmonized', 'physical_risk_exposure_idx', [42, 45, 48, 46], 35, 'pts'],
      ['aoi-rosetta', 'trend-alerts', 'NASA POWER + GPM', 'salinity_proxy_drift', [1.8, 2.1, 2.5, 2.3], 1.5, 'dS/m'],
    ];

    for (const [aoiId, moduleId, sourceName, metricKey, vals, baseline, unit] of sampleMatrix) {
      vals.forEach((val, idx) => {
        const delta = Number((val - baseline).toFixed(3));
        insertObs.run(aoiId, moduleId, sourceName, periods[idx], metricKey, val, unit, baseline, delta);
      });
    }

    const insertAlert = db.prepare(`
      INSERT INTO trend_alerts (id, workspace_id, title_en, title_ar, module_id, lat, lon, radius_km, metric_key, operator, threshold_value, unit, severity, channel, enabled, last_evaluated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAlert.run('alt-001', 'ws-delta-agro', 'Rosetta Coastal Sea-Level Anomaly Watch', 'مراقبة شذوذ مستوى سطح البحر في رشيد', 'delta-risk', 31.404, 30.416, 18, 'coastal_elevation_anomaly_mm', '>', 40, 'mm', 'High', 'Webhook + Email', 1, now, now);
    insertAlert.run('alt-002', 'ws-delta-agro', 'East Delta NDVI Crop Vigor Drop', 'انخفاض مؤشر الغطاء النباتي بشرق الدلتا', 'crop-health', 30.732, 31.719, 25, 'ndvi_vigor_index', '<', 0.6, 'index', 'Elevated', 'Dashboard + Email', 1, now, now);
    insertAlert.run('alt-003', 'ws-metro-municipality', 'Cairo Thermal Island Surface Peak', 'ذروة جزيرة الحرارة السطحية بالقاهرة', 'urban-heat', 30.044, 31.235, 30, 'surface_temp_anomaly_c', '>', 4.0, '°C', 'Critical', 'Webhook + SMS', 1, now, now);
    insertAlert.run('alt-004', 'ws-coastal-banking', 'Gulf Corridor Dust Plume Optical Depth', 'كثافة أعمدة الغبار في الممر الخليجي', 'air-dust', 27.011, 49.658, 22, 'aerosol_optical_depth', '>', 0.55, 'AOD', 'Moderate', 'API Webhook', 1, now, now);

    const insertReport = db.prepare(`
      INSERT INTO report_requests (id, workspace_id, organization_name, sector, standard, module_ids, lat, lon, report_type, status, data_provenance, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAMPLE_DEMONSTRATION', ?)
    `);
    insertReport.run('rep-sample-101', 'ws-coastal-banking', 'Mediterranean Coastal Asset Fund (Sample)', 'Banking & Real Estate', 'ISSB IFRS S2', 'delta-risk,esg-reporting,urban-heat', 31.200, 29.918, 'Standard Sandbox Export', 'READY_SAMPLE', now);
    insertReport.run('rep-sample-102', 'ws-delta-agro', 'Delta Horizon Growers Co-op (Sample)', 'Agriculture & Exporting', 'CSRD ESRS E1/E4', 'crop-health,water-monitoring', 30.732, 31.719, 'Custom Paid Report Request', 'SCOPING_REVIEW', now);
  }

  // Default sandbox evaluation key: hashed at rest, bound to ws-delta-agro, disabled in production
  const disableDemoKey =
    process.env.NODE_ENV === 'production' || process.env.CLIMATO_DISABLE_DEMO_KEY === 'true';
  const defaultDemoToken = 'clm_sbx_demo_9f4a2c81e0b7';
  const defaultMasked = maskApiToken(defaultDemoToken);
  const defaultHash = hashApiToken(defaultDemoToken);

  if (disableDemoKey) {
    db.prepare(`UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = 'key-sbx-default'`).run(
      new Date().toISOString()
    );
  } else {
    db.prepare(`
      INSERT INTO api_keys (
        id, label, token_value, token_hash, token_prefix, workspace_id,
        environment, scopes, rate_limit_rpm, last_used_at, revoked_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        token_value = excluded.token_value,
        token_hash = excluded.token_hash,
        token_prefix = excluded.token_prefix,
        workspace_id = excluded.workspace_id,
        scopes = excluded.scopes,
        rate_limit_rpm = excluded.rate_limit_rpm,
        revoked_at = NULL
    `).run(
      'key-sbx-default',
      'CLIMATO Sandbox Evaluation Key',
      defaultMasked,
      defaultHash,
      defaultMasked,
      'ws-delta-agro',
      'sandbox',
      'modules:read,reports:write,alerts:write,connectors:read,geospatial:analyze',
      120,
      new Date().toISOString(),
      new Date().toISOString()
    );
  }

  // Ensure NASA GLDAS connector exists alongside MERRA-2, GPM IMERG, and GRACE-FO
  db.prepare(`
    INSERT OR IGNORE INTO satellite_connectors (
      id, source_name, agency, temporal_cadence, spatial_resolution,
      primary_variables, mapped_modules, integration_stage,
      data_provenance_status, ingestion_format, required_env_var, endpoint_template
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'gldas',
    'NASA GLDAS Noah 2.1 Soil Moisture',
    'NASA GSFC / GES DISC',
    'Monthly (2000–Present)',
    '0.25° × 0.25° (~28 km)',
    'Surface & Root-Zone Soil Moisture (SoilMoi0_10cm_inst)',
    'crop-health,water-monitoring,delta-risk',
    'STAGED_ADAPTER_READY',
    'PENDING_CONFIGURATION',
    'NetCDF4 / OPeNDAP',
    'NASA_EARTHDATA_TOKEN',
    'https://hydro1.gesdisc.eosdis.nasa.gov/opendap/GLDAS/GLDAS_NOAH025_M.2.1/'
  );

  // Seed configurable Egyptian study regions if empty
  const regionCount = db.prepare('SELECT COUNT(*) as count FROM study_regions').get() as { count: number };
  if (regionCount.count === 0) {
    const insertRegion = db.prepare(`
      INSERT INTO study_regions (
        id, name_en, name_ar, classification_en, classification_ar,
        center_lat, center_lon, min_lat, max_lat, min_lon, max_lon,
        approx_area_km2, selection_rationale_en, selection_rationale_ar,
        primary_stressors_en, primary_stressors_ar, is_default, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const nowTs = new Date().toISOString();
    for (const r of DEFAULT_STUDY_REGIONS) {
      insertRegion.run(
        r.id,
        r.nameEn,
        r.nameAr,
        r.classificationEn,
        r.classificationAr,
        r.centerLat,
        r.centerLon,
        r.minLat,
        r.maxLat,
        r.minLon,
        r.maxLon,
        r.approxAreaKm2,
        r.selectionRationaleEn,
        r.selectionRationaleAr,
        r.primaryClimateStressorsEn,
        r.primaryClimateStressorsAr,
        r.isDefault ? 1 : 0,
        nowTs
      );
    }
  }

  // Upsert exact 4 required NASA Earth observation datasets
  const upsertDataset = db.prepare(`
    INSERT INTO scientific_datasets (
      id, variable_key, variable_name_en, variable_name_ar, dataset_name,
      product_id, product_version, target_variable_field, agency,
      documentation_url, cmr_short_name, cmr_collection_concept_id,
      access_method, endpoint_template, required_env_var,
      temporal_resolution, spatial_resolution, native_footprint_km,
      native_unit, normalized_unit, normalization_formula,
      coverage_period, quality_flags, licensing,
      scale_limitation_en, scale_limitation_ar
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      dataset_name = excluded.dataset_name,
      product_id = excluded.product_id,
      product_version = excluded.product_version,
      target_variable_field = excluded.target_variable_field,
      documentation_url = excluded.documentation_url,
      cmr_short_name = excluded.cmr_short_name,
      cmr_collection_concept_id = excluded.cmr_collection_concept_id,
      access_method = excluded.access_method,
      endpoint_template = excluded.endpoint_template,
      spatial_resolution = excluded.spatial_resolution,
      native_footprint_km = excluded.native_footprint_km,
      scale_limitation_en = excluded.scale_limitation_en,
      scale_limitation_ar = excluded.scale_limitation_ar
  `);

  for (const d of SCIENTIFIC_DATASETS) {
    upsertDataset.run(
      d.id,
      d.variableKey,
      d.variableNameEn,
      d.variableNameAr,
      d.datasetName,
      d.productId,
      d.productVersion,
      d.targetVariableField,
      d.agency,
      d.documentationUrl,
      d.cmrShortName,
      d.cmrCollectionConceptId,
      d.accessMethod,
      d.endpointTemplate,
      d.requiredEnvVar,
      d.temporalResolution,
      d.spatialResolution,
      d.nativeFootprintKm,
      d.nativeUnit,
      d.normalizedUnit,
      d.normalizationFormula,
      d.coveragePeriod,
      d.qualityFlags,
      d.licensing,
      d.scaleLimitationEn,
      d.scaleLimitationAr
    );
  }

  // Upsert all 12 required research & data hub sources while preserving live probe statuses if already stored
  const upsertResearch = db.prepare(`
    INSERT INTO research_sources (
      id, title_en, title_ar, url, organization, classification,
      description_en, description_ar, relevance_en, relevance_ar,
      integration_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title_en = excluded.title_en,
      title_ar = excluded.title_ar,
      url = excluded.url,
      organization = excluded.organization,
      classification = excluded.classification,
      description_en = excluded.description_en,
      description_ar = excluded.description_ar,
      relevance_en = excluded.relevance_en,
      relevance_ar = excluded.relevance_ar
  `);

  for (const s of RESEARCH_SOURCES) {
    upsertResearch.run(
      s.id,
      s.titleEn,
      s.titleAr,
      s.url,
      s.organization,
      s.classification,
      s.descriptionEn,
      s.descriptionAr,
      s.relevanceEn,
      s.relevanceAr,
      s.initialStatus
    );
  }
}
