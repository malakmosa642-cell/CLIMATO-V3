import crypto from 'node:crypto';
import { db, recordAuditLog, withTransaction } from '../db/database.ts';
import { listSatelliteConnectors } from '../connectors/satelliteRegistry.ts';
import { DEFAULT_STUDY_REGIONS, SCIENTIFIC_DATASETS } from '../data/scientificCatalog.ts';
import { analyzeTimeSeriesTrends } from './trendAnalysisEngine.ts';
import {
  dispatchWorkspaceAlertWebhooks,
  getPlatformWebhookSecret,
} from './webhookService.ts';

interface AoiRow {
  id: string;
  workspace_id: string;
  name_en: string;
  name_ar: string;
  lat: number;
  lon: number;
  radius_km: number;
  region_code: string;
  primary_module: string;
}

interface AlertRow {
  id: string;
  workspace_id: string;
  title_en: string;
  title_ar: string;
  module_id: string;
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
}

interface ObservationRow {
  id: number;
  aoi_id: string;
  workspace_id: string;
  module_id: string;
  metric_key: string;
  metric_value: number;
  unit: string;
  period_label: string;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((EARTH_RADIUS_KM * c).toFixed(2));
}

export interface CoordinateRiskProfile {
  coordinates: { lat: number; lon: number; projection: 'EPSG:4326' };
  regionClassification: {
    corridorCode: string;
    labelEn: string;
    labelAr: string;
  };
  nearestRegisteredAoi: {
    id: string;
    nameEn: string;
    nameAr: string;
    distanceKm: number;
    withinGeofence: boolean;
  } | null;
  compositeRiskScore: number;
  riskTier: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';
  indices: {
    coastalExposure: { score: number; anomalyMm: number; unit: string };
    urbanHeatDelta: { score: number; deltaC: number; unit: string };
    agroMoistureStress: { score: number; ndviProxy: number; unit: string };
    dustAerosolTier: { score: number; aodProxy: number; unit: string };
  };
  recommendedConnectors: Array<{ id: string; sourceName: string; spatialResolution: string }>;
  isSampleData: true;
  mode: 'DEMONSTRATION_SAMPLE';
  dataProvenance: 'SAMPLE_DEMONSTRATION';
  notice: string;
  analyzedAt: string;
}

export function computeCoordinateRiskProfile(lat: number, lon: number): CoordinateRiskProfile {
  const aois = db.prepare('SELECT * FROM aoi_locations').all() as unknown as AoiRow[];

  let nearest: { row: AoiRow; distanceKm: number } | null = null;
  for (const aoi of aois) {
    const d = haversineKm(lat, lon, aoi.lat, aoi.lon);
    if (!nearest || d < nearest.distanceKm) {
      nearest = { row: aoi, distanceKm: d };
    }
  }

  let corridor = {
    corridorCode: 'MENA-GEN',
    labelEn: 'Regional Climate Corridor',
    labelAr: 'ممر مناخي إقليمي',
  };

  if (lat >= 30.85 && lat <= 31.8 && lon >= 29.2 && lon <= 32.8) {
    corridor = {
      corridorCode: 'EG-MED-DELTA',
      labelEn: 'Northern Nile Delta & Mediterranean Coast',
      labelAr: 'ساحل دلتا النيل الشمالي والبحر المتوسط',
    };
  } else if (lat >= 29.6 && lat < 30.85 && lon >= 30.5 && lon <= 32.2) {
    corridor = {
      corridorCode: 'EG-CAIRO-DELTA',
      labelEn: 'Greater Cairo & South Delta Basin',
      labelAr: 'القاهرة الكبرى وحوض جنوب الدلتا',
    };
  } else if (lat >= 22.0 && lat < 29.6 && lon >= 28.0 && lon <= 34.5) {
    corridor = {
      corridorCode: 'EG-UPPER-NILE',
      labelEn: 'Upper Nile Valley & Reclamation Corridor',
      labelAr: 'وادي النيل العلوي وممرات الاستصلاح',
    };
  } else if (lat >= 24.0 && lat <= 31.5 && lon > 32.2 && lon <= 35.8) {
    corridor = {
      corridorCode: 'EG-REDSEA-SINAI',
      labelEn: 'Red Sea Littoral & Sinai Corridor',
      labelAr: 'ساحل البحر الأحمر وممر سيناء',
    };
  }

  const coastProximity = Math.max(0, 1 - Math.abs(lat - 31.35) / 8);
  const desertHeatFactor = Math.max(0, 1 - Math.abs(lat - 27.5) / 10);
  const deltaAgroFactor =
    lat >= 29.8 && lat <= 31.6 && lon >= 30.0 && lon <= 32.1 ? 0.78 : 0.44;
  const microVariance = Math.abs(Math.sin(lat * 7.13 + lon * 11.41));

  const coastalScore = Math.round(28 + coastProximity * 54 + microVariance * 10);
  const urbanHeatScore = Math.round(32 + desertHeatFactor * 46 + microVariance * 12);
  const agroStressScore = Math.round(26 + (1 - deltaAgroFactor * 0.45) * 44 + microVariance * 14);
  const dustScore = Math.round(30 + desertHeatFactor * 38 + microVariance * 16);

  const compositeRiskScore = Math.round(
    coastalScore * 0.28 + urbanHeatScore * 0.28 + agroStressScore * 0.24 + dustScore * 0.20
  );

  const riskTier: CoordinateRiskProfile['riskTier'] =
    compositeRiskScore >= 75
      ? 'HIGH'
      : compositeRiskScore >= 58
      ? 'ELEVATED'
      : compositeRiskScore >= 40
      ? 'MODERATE'
      : 'LOW';

  const connectors = listSatelliteConnectors();
  const preferredIds =
    coastalScore >= urbanHeatScore
      ? ['sentinel-6', 'landsat', 'grace-fo', 'smap']
      : ['ecostress', 'modis', 'tropomi', 'merra-2'];

  const recommendedConnectors = connectors
    .filter((c) => preferredIds.includes(c.id))
    .map((c) => ({
      id: c.id,
      sourceName: c.source_name,
      spatialResolution: c.spatial_resolution,
    }));

  return {
    coordinates: {
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      projection: 'EPSG:4326',
    },
    regionClassification: corridor,
    nearestRegisteredAoi: nearest
      ? {
          id: nearest.row.id,
          nameEn: nearest.row.name_en,
          nameAr: nearest.row.name_ar,
          distanceKm: nearest.distanceKm,
          withinGeofence: nearest.distanceKm <= nearest.row.radius_km,
        }
      : null,
    compositeRiskScore,
    riskTier,
    indices: {
      coastalExposure: {
        score: coastalScore,
        anomalyMm: Number((18 + coastProximity * 26 + microVariance * 5).toFixed(1)),
        unit: 'mm',
      },
      urbanHeatDelta: {
        score: urbanHeatScore,
        deltaC: Number((1.9 + desertHeatFactor * 3.1 + microVariance * 0.6).toFixed(1)),
        unit: '°C',
      },
      agroMoistureStress: {
        score: agroStressScore,
        ndviProxy: Number((0.28 + deltaAgroFactor * 0.42 - microVariance * 0.06).toFixed(2)),
        unit: 'NDVI',
      },
      dustAerosolTier: {
        score: dustScore,
        aodProxy: Number((0.22 + desertHeatFactor * 0.34 + microVariance * 0.11).toFixed(2)),
        unit: 'AOD',
      },
    },
    recommendedConnectors,
    isSampleData: true,
    mode: 'DEMONSTRATION_SAMPLE',
    dataProvenance: 'SAMPLE_DEMONSTRATION',
    notice:
      'DEMONSTRATION_SAMPLE MODE: Synthesized spatial indices for platform illustration. Use Scientific Mode (/api/science/coordinate-profile or mode="SCIENTIFIC") for real persisted Earth observation metrics.',
    analyzedAt: new Date().toISOString(),
  };
}

export interface ScientificCoordinateProfile {
  mode: 'SCIENTIFIC';
  coordinates: { lat: number; lon: number; crs: 'EPSG:4326' };
  intersectingStudyRegion: {
    id: string;
    nameEn: string;
    nameAr: string;
    bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
    exactBoundaryIntersection: boolean;
    distanceToCenterKm: number;
  } | null;
  status: 'COMPLETED' | 'INSUFFICIENT_DATA';
  isRealObservation: boolean;
  dataProvenance: 'LIVE_NASA_EARTHDATA' | 'IMPORTED_OBSERVATIONS' | 'INSUFFICIENT_DATA';
  datasets: Array<{
    datasetId: string;
    productId: string;
    nativeSpatialResolution: string;
    nativeFootprintKm: number;
    scaleMismatchWarning: string | null;
    status: 'COMPLETED' | 'INSUFFICIENT_DATA';
    provenanceType: string;
    validObservations: number;
    coveragePct: number;
    latestValue: number | null;
    unit: string;
    theilSenSlopePerYear: number | null;
    ci95: [number | null, number | null];
    pValueTwoSided: number | null;
  }>;
  limitations: string[];
  analyzedAt: string;
}

export function computeScientificCoordinateProfile(
  lat: number,
  lon: number,
  datasetFilter?: string
): ScientificCoordinateProfile {
  const regionRows = db.prepare('SELECT * FROM study_regions').all() as Array<Record<string, unknown>>;
  const regions =
    regionRows.length > 0
      ? regionRows.map((r) => ({
          id: String(r.id),
          nameEn: String(r.name_en),
          nameAr: String(r.name_ar),
          centerLat: Number(r.center_lat),
          centerLon: Number(r.center_lon),
          minLat: Number(r.min_lat),
          maxLat: Number(r.max_lat),
          minLon: Number(r.min_lon),
          maxLon: Number(r.max_lon),
        }))
      : DEFAULT_STUDY_REGIONS.map((r) => ({
          id: r.id,
          nameEn: r.nameEn,
          nameAr: r.nameAr,
          centerLat: r.centerLat,
          centerLon: r.centerLon,
          minLat: r.minLat,
          maxLat: r.maxLat,
          minLon: r.minLon,
          maxLon: r.maxLon,
        }));

  const exactMatch = regions.find(
    (r) => lat >= r.minLat && lat <= r.maxLat && lon >= r.minLon && lon <= r.maxLon
  );

  const selectedRegion = exactMatch || null;
  const targetDatasets = datasetFilter
    ? SCIENTIFIC_DATASETS.filter((d) => d.id === datasetFilter)
    : SCIENTIFIC_DATASETS;

  const limitations: string[] = [
    'Coordinate queries run in CRS EPSG:4326 against stored study region bounding boxes.',
    'GRACE-FO mascon resolution (~300 km) cannot isolate parcel-level or urban-district terrestrial water storage.',
  ];

  if (!selectedRegion) {
    return {
      mode: 'SCIENTIFIC',
      coordinates: { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)), crs: 'EPSG:4326' },
      intersectingStudyRegion: null,
      status: 'INSUFFICIENT_DATA',
      isRealObservation: false,
      dataProvenance: 'INSUFFICIENT_DATA',
      datasets: targetDatasets.map((d) => ({
        datasetId: d.id,
        productId: d.productId,
        nativeSpatialResolution: d.spatialResolution,
        nativeFootprintKm: d.nativeFootprintKm,
        scaleMismatchWarning: d.id === 'grace-fo' ? d.scaleLimitationEn : null,
        status: 'INSUFFICIENT_DATA',
        provenanceType: 'NO_REGION_INTERSECTION',
        validObservations: 0,
        coveragePct: 0,
        latestValue: null,
        unit: d.normalizedUnit,
        theilSenSlopePerYear: null,
        ci95: [null, null],
        pValueTwoSided: null,
      })),
      limitations: [
        ...limitations,
        'Query coordinate does not fall inside any configured study region bounding box; refusing to extrapolate outside region boundaries.',
      ],
      analyzedAt: new Date().toISOString(),
    };
  }

  let anyReal = false;
  let primaryProv: ScientificCoordinateProfile['dataProvenance'] = 'INSUFFICIENT_DATA';

  const datasetResults = targetDatasets.map((ds) => {
    const rows = db
      .prepare(
        `SELECT obs_date, year, month, normalized_value, is_missing, provenance_type
         FROM scientific_observations
         WHERE region_id = ? AND dataset_id = ? AND provenance_type IN ('LIVE_NASA_EARTHDATA', 'IMPORTED_OBSERVATIONS')
         ORDER BY obs_date ASC`
      )
      .all(selectedRegion.id, ds.id) as Array<{
      obs_date: string;
      year: number;
      month: number;
      normalized_value: number | null;
      is_missing: number;
      provenance_type: string;
    }>;

    const scaleMismatchWarning =
      ds.id === 'grace-fo'
        ? ds.scaleLimitationEn
        : ds.nativeFootprintKm >= 28
        ? `Gridded sensor footprint (${ds.spatialResolution}) averages across the bounding box rather than exact point scale.`
        : null;

    if (rows.length === 0) {
      return {
        datasetId: ds.id,
        productId: ds.productId,
        nativeSpatialResolution: ds.spatialResolution,
        nativeFootprintKm: ds.nativeFootprintKm,
        scaleMismatchWarning,
        status: 'INSUFFICIENT_DATA' as const,
        provenanceType: 'INSUFFICIENT_DATA',
        validObservations: 0,
        coveragePct: 0,
        latestValue: null,
        unit: ds.normalizedUnit,
        theilSenSlopePerYear: null,
        ci95: [null, null] as [number | null, number | null],
        pValueTwoSided: null,
      };
    }

    anyReal = true;
    const prov = rows[rows.length - 1].provenance_type as
      | 'LIVE_NASA_EARTHDATA'
      | 'IMPORTED_OBSERVATIONS';
    if (prov === 'LIVE_NASA_EARTHDATA') primaryProv = 'LIVE_NASA_EARTHDATA';
    else if (primaryProv === 'INSUFFICIENT_DATA') primaryProv = 'IMPORTED_OBSERVATIONS';

    const pts = rows.map((r) => ({
      obsDate: r.obs_date,
      year: r.year,
      month: r.month,
      value: r.is_missing ? null : r.normalized_value,
    }));
    const validRows = rows.filter((r) => !r.is_missing && r.normalized_value !== null);
    const latestValue = validRows.length > 0 ? validRows[validRows.length - 1].normalized_value : null;
    const report = analyzeTimeSeriesTrends(pts, ds.normalizedUnit, { expectedSteps: pts.length });

    return {
      datasetId: ds.id,
      productId: ds.productId,
      nativeSpatialResolution: ds.spatialResolution,
      nativeFootprintKm: ds.nativeFootprintKm,
      scaleMismatchWarning,
      status: report.status === 'INSUFFICIENT_DATA' ? ('INSUFFICIENT_DATA' as const) : ('COMPLETED' as const),
      provenanceType: prov,
      validObservations: report.diagnostics.validObservations,
      coveragePct: report.diagnostics.coveragePct,
      latestValue,
      unit: ds.normalizedUnit,
      theilSenSlopePerYear: report.theilSen.slopePerYear,
      ci95: [report.theilSen.ci95LowerPerYear, report.theilSen.ci95UpperPerYear] as [number | null, number | null],
      pValueTwoSided: report.mannKendall.pValueTwoSided,
    };
  });

  return {
    mode: 'SCIENTIFIC',
    coordinates: { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)), crs: 'EPSG:4326' },
    intersectingStudyRegion: {
      id: selectedRegion.id,
      nameEn: selectedRegion.nameEn,
      nameAr: selectedRegion.nameAr,
      bbox: {
        minLat: selectedRegion.minLat,
        maxLat: selectedRegion.maxLat,
        minLon: selectedRegion.minLon,
        maxLon: selectedRegion.maxLon,
      },
      exactBoundaryIntersection: true,
      distanceToCenterKm: haversineKm(lat, lon, selectedRegion.centerLat, selectedRegion.centerLon),
    },
    status: anyReal ? 'COMPLETED' : 'INSUFFICIENT_DATA',
    isRealObservation: anyReal,
    dataProvenance: primaryProv,
    datasets: datasetResults,
    limitations,
    analyzedAt: new Date().toISOString(),
  };
}

function compareThreshold(observed: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case '>':
      return observed > threshold;
    case '>=':
      return observed >= threshold;
    case '<':
      return observed < threshold;
    case '<=':
      return observed <= threshold;
    default:
      return observed > threshold;
  }
}

export interface EvaluatedAlertResult {
  evaluationId: string;
  alertId: string;
  alertTitleEn: string;
  moduleId: string;
  matchedAoiId: string | null;
  matchedDistanceKm: number | null;
  metricKey: string;
  observedValue: number | null;
  operator: string;
  thresholdValue: number;
  unit: string;
  breached: boolean;
  evaluationStatus: 'EVALUATED' | 'INSUFFICIENT_DATA';
  deliveryStatus: string;
  webhookDeliveries?: Array<{
    deliveryId: string;
    targetUrl: string;
    status: 'SENT' | 'FAILED';
    httpStatus: number | null;
    attemptCount: number;
    errorMessage: string | null;
  }>;
  webhookSignatureHeader: string;
  isSampleData: true;
  dataProvenance: 'SAMPLE_DEMONSTRATION';
  evaluatedAt: string;
}

export async function evaluateGeofenceAlerts(
  targetAlertId?: string,
  requestId = 'system-eval',
  explicitWebhookUrl?: string
): Promise<EvaluatedAlertResult[]> {
  const alerts = (
    targetAlertId
      ? db.prepare('SELECT * FROM trend_alerts WHERE id = ?').all(targetAlertId)
      : db.prepare('SELECT * FROM trend_alerts WHERE enabled = 1 ORDER BY created_at DESC').all()
  ) as unknown as AlertRow[];

  const aois = db.prepare('SELECT * FROM aoi_locations').all() as unknown as AoiRow[];
  const observations = db
    .prepare(
      `SELECT o.id, o.aoi_id, a.workspace_id, o.module_id, o.metric_key, o.metric_value, o.unit, o.period_label
       FROM sample_observations o
       JOIN aoi_locations a ON o.aoi_id = a.id
       ORDER BY o.id DESC`
    )
    .all() as unknown as ObservationRow[];

  const webhookSecret = getPlatformWebhookSecret();
  const now = new Date().toISOString();
  const results: EvaluatedAlertResult[] = [];

  for (const alert of alerts) {
    const workspaceAois = aois.filter((a) => a.workspace_id === alert.workspace_id);
    const inGeofenceAois = workspaceAois
      .map((aoi) => ({ aoi, distanceKm: haversineKm(alert.lat, alert.lon, aoi.lat, aoi.lon) }))
      .filter((entry) => entry.distanceKm <= alert.radius_km)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const bestAoi = inGeofenceAois[0] || null;

    let matchedObs: ObservationRow | undefined;
    if (bestAoi) {
      matchedObs =
        observations.find(
          (o) =>
            o.workspace_id === alert.workspace_id &&
            o.aoi_id === bestAoi.aoi.id &&
            o.module_id === alert.module_id &&
            o.metric_key === alert.metric_key
        ) ||
        observations.find(
          (o) =>
            o.workspace_id === alert.workspace_id &&
            o.aoi_id === bestAoi.aoi.id &&
            o.module_id === alert.module_id
        );
    }

    const evaluationId = `evl-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;

    if (!matchedObs || !Number.isFinite(matchedObs.metric_value)) {
      const payloadForSig = JSON.stringify({
        event: 'climato.threshold.insufficient_data',
        evaluationId,
        alertId: alert.id,
        moduleId: alert.module_id,
        coordinates: { lat: alert.lat, lon: alert.lon, radiusKm: alert.radius_km },
        observedValue: null,
        thresholdValue: alert.threshold_value,
        dataProvenance: 'SAMPLE_DEMONSTRATION',
        evaluatedAt: now,
      });
      const sigHex = crypto.createHmac('sha256', webhookSecret).update(payloadForSig).digest('hex');
      const signatureHeader = `sha256=${sigHex}`;
      const deliveryStatus = 'INSUFFICIENT_DATA_NO_DISPATCH';

      withTransaction(() => {
        db.prepare(`
          INSERT INTO alert_evaluations (
            id, alert_id, matched_aoi_id, observed_value, threshold_value,
            breached, evaluation_status, webhook_signature, delivery_status, evaluated_at
          ) VALUES (?, ?, ?, NULL, ?, 0, 'INSUFFICIENT_DATA', ?, ?, ?)
        `).run(
          evaluationId,
          alert.id,
          bestAoi ? bestAoi.aoi.id : null,
          alert.threshold_value,
          signatureHeader,
          deliveryStatus,
          now
        );

        db.prepare('UPDATE trend_alerts SET last_evaluated_at = ? WHERE id = ?').run(now, alert.id);
      });

      recordAuditLog({
        requestId,
        actor: 'geofence-evaluator',
        action: 'ALERT_INSUFFICIENT_DATA',
        resourceType: 'trend_alert',
        resourceId: alert.id,
        metadata: {
          evaluationId,
          observedValue: null,
          thresholdValue: alert.threshold_value,
          matchedAoiId: bestAoi?.aoi.id ?? null,
        },
      });

      results.push({
        evaluationId,
        alertId: alert.id,
        alertTitleEn: alert.title_en,
        moduleId: alert.module_id,
        matchedAoiId: bestAoi ? bestAoi.aoi.id : null,
        matchedDistanceKm: bestAoi ? bestAoi.distanceKm : null,
        metricKey: alert.metric_key,
        observedValue: null,
        operator: alert.operator,
        thresholdValue: alert.threshold_value,
        unit: alert.unit,
        breached: false,
        evaluationStatus: 'INSUFFICIENT_DATA',
        deliveryStatus,
        webhookSignatureHeader: signatureHeader,
        isSampleData: true,
        dataProvenance: 'SAMPLE_DEMONSTRATION',
        evaluatedAt: now,
      });
      continue;
    }

    const observedValue = matchedObs.metric_value;
    const breached = compareThreshold(observedValue, alert.operator, alert.threshold_value);

    const payloadObject = {
      event: breached ? 'climato.threshold.breached' : 'climato.threshold.nominal',
      evaluationId,
      alertId: alert.id,
      moduleId: alert.module_id,
      coordinates: { lat: alert.lat, lon: alert.lon, radiusKm: alert.radius_km },
      observedValue,
      thresholdValue: alert.threshold_value,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      evaluatedAt: now,
    };

    const webhookPayload = JSON.stringify(payloadObject);
    const signatureHex = crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookPayload)
      .digest('hex');
    const signatureHeader = `sha256=${signatureHex}`;

    let deliveryStatus = 'NOMINAL_NO_DISPATCH';
    let webhookDeliveries: EvaluatedAlertResult['webhookDeliveries'];

    if (breached) {
      const dispatch = await dispatchWorkspaceAlertWebhooks({
        workspaceId: alert.workspace_id,
        alertId: alert.id,
        evaluationId,
        payloadObject,
        explicitWebhookUrl,
      });
      deliveryStatus = dispatch.overallStatus;
      webhookDeliveries = dispatch.deliveries.map((d) => ({
        deliveryId: d.deliveryId,
        targetUrl: d.targetUrl,
        status: d.status,
        httpStatus: d.httpStatus,
        attemptCount: d.attemptCount,
        errorMessage: d.errorMessage,
      }));
    }

    withTransaction(() => {
      db.prepare(`
        INSERT INTO alert_evaluations (
          id, alert_id, matched_aoi_id, observed_value, threshold_value,
          breached, evaluation_status, webhook_signature, delivery_status, evaluated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'EVALUATED', ?, ?, ?)
      `).run(
        evaluationId,
        alert.id,
        bestAoi ? bestAoi.aoi.id : null,
        observedValue,
        alert.threshold_value,
        breached ? 1 : 0,
        signatureHeader,
        deliveryStatus,
        now
      );

      db.prepare('UPDATE trend_alerts SET last_evaluated_at = ? WHERE id = ?').run(now, alert.id);
    });

    recordAuditLog({
      requestId,
      actor: 'geofence-evaluator',
      action: breached ? 'ALERT_THRESHOLD_BREACHED' : 'ALERT_EVALUATED_NOMINAL',
      resourceType: 'trend_alert',
      resourceId: alert.id,
      metadata: {
        evaluationId,
        observedValue,
        thresholdValue: alert.threshold_value,
        matchedAoiId: bestAoi?.aoi.id ?? null,
        deliveryStatus,
      },
    });

    results.push({
      evaluationId,
      alertId: alert.id,
      alertTitleEn: alert.title_en,
      moduleId: alert.module_id,
      matchedAoiId: bestAoi ? bestAoi.aoi.id : null,
      matchedDistanceKm: bestAoi ? bestAoi.distanceKm : null,
      metricKey: alert.metric_key,
      observedValue,
      operator: alert.operator,
      thresholdValue: alert.threshold_value,
      unit: alert.unit,
      breached,
      evaluationStatus: 'EVALUATED',
      deliveryStatus,
      webhookDeliveries,
      webhookSignatureHeader: signatureHeader,
      isSampleData: true,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      evaluatedAt: now,
    });
  }

  return results;
}
