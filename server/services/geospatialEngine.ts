import crypto from 'node:crypto';
import { db, recordAuditLog } from '../db/database.ts';
import { listSatelliteConnectors } from '../connectors/satelliteRegistry.ts';

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
  module_id: string;
  metric_key: string;
  metric_value: number;
  unit: string;
  period_label: string;
}

const EARTH_RADIUS_KM = 6371;
const EPHEMERAL_DEV_WEBHOOK_SECRET = crypto.randomBytes(32).toString('hex');

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

  // Classify Egyptian/Regional corridor geographically using WGS84 bounds
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

  // Deterministic, geographically grounded placeholder metrics clearly flagged as SAMPLE_DEMONSTRATION
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
    dataProvenance: 'SAMPLE_DEMONSTRATION',
    notice:
      'SAMPLE DEMONSTRATION RISK PROFILE: Synthesized geospatial baseline for integration testing; connect staged satellite workers for live verified measurements.',
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
  observedValue: number;
  operator: string;
  thresholdValue: number;
  unit: string;
  breached: boolean;
  deliveryStatus: string;
  webhookSignatureHeader: string;
  isSampleData: true;
  dataProvenance: 'SAMPLE_DEMONSTRATION';
  evaluatedAt: string;
}

export function evaluateGeofenceAlerts(
  targetAlertId?: string,
  requestId = 'system-eval'
): EvaluatedAlertResult[] {
  const alerts = (
    targetAlertId
      ? db.prepare('SELECT * FROM trend_alerts WHERE id = ?').all(targetAlertId)
      : db.prepare('SELECT * FROM trend_alerts WHERE enabled = 1 ORDER BY created_at DESC').all()
  ) as unknown as AlertRow[];

  const aois = db.prepare('SELECT * FROM aoi_locations').all() as unknown as AoiRow[];
  const observations = db
    .prepare('SELECT * FROM sample_observations ORDER BY id DESC')
    .all() as unknown as ObservationRow[];

  const configuredSecret = process.env.CLIMATO_WEBHOOK_SECRET?.trim();
  if (!configuredSecret && process.env.NODE_ENV === 'production') {
    throw new Error('CLIMATO_WEBHOOK_SECRET must be set in production for HMAC webhook signing.');
  }
  const webhookSecret = configuredSecret || EPHEMERAL_DEV_WEBHOOK_SECRET;
  const now = new Date().toISOString();
  const results: EvaluatedAlertResult[] = [];

  for (const alert of alerts) {
    // Match closest AOI within geofence radius or nearest regional reference
    let bestAoi: { aoi: AoiRow; distanceKm: number } | null = null;
    for (const aoi of aois) {
      const dist = haversineKm(alert.lat, alert.lon, aoi.lat, aoi.lon);
      if (!bestAoi || dist < bestAoi.distanceKm) {
        bestAoi = { aoi, distanceKm: dist };
      }
    }

    const matchedObs = observations.find(
      (o) =>
        o.module_id === alert.module_id &&
        (o.metric_key === alert.metric_key || (bestAoi && o.aoi_id === bestAoi.aoi.id))
    ) || observations.find((o) => o.module_id === alert.module_id);

    const observedValue = matchedObs
      ? matchedObs.metric_value
      : Number((alert.threshold_value * 1.08).toFixed(2));

    const breached = compareThreshold(observedValue, alert.operator, alert.threshold_value);
    const evaluationId = `evl-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const deliveryStatus = breached ? 'SANDBOX_WEBHOOK_SIGNED' : 'NOMINAL_NO_DISPATCH';

    const webhookPayload = JSON.stringify({
      event: breached ? 'climato.threshold.breached' : 'climato.threshold.nominal',
      evaluationId,
      alertId: alert.id,
      moduleId: alert.module_id,
      coordinates: { lat: alert.lat, lon: alert.lon, radiusKm: alert.radius_km },
      observedValue,
      thresholdValue: alert.threshold_value,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      evaluatedAt: now,
    });

    const signatureHex = crypto
      .createHmac('sha256', webhookSecret)
      .update(webhookPayload)
      .digest('hex');
    const signatureHeader = `sha256=${signatureHex}`;

    db.prepare(`
      INSERT INTO alert_evaluations (
        id, alert_id, matched_aoi_id, observed_value, threshold_value,
        breached, webhook_signature, delivery_status, evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      deliveryStatus,
      webhookSignatureHeader: signatureHeader,
      isSampleData: true,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      evaluatedAt: now,
    });
  }

  return results;
}
