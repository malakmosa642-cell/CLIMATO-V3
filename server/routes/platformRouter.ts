import crypto from 'node:crypto';
import { Router } from 'express';
import { db, recordAuditLog, withTransaction } from '../db/database.ts';
import { listSatelliteConnectors } from '../connectors/satelliteRegistry.ts';
import {
  ApiError,
  RequestWithContext,
  assertOrganizationOwnership,
  assertTenantRecordOwnership,
  asyncHandler,
  authBruteForceRateLimiter,
  getAllowedWorkspaceIdsForRequest,
  parsePagination,
  requireAuthenticated,
  requireKeyManagementAuth,
  requireRoles,
  resolveTenantWorkspaceId,
} from '../middleware/requestContext.ts';
import {
  computeCoordinateRiskProfile,
  computeScientificCoordinateProfile,
  evaluateGeofenceAlerts,
} from '../services/geospatialEngine.ts';
import {
  ReportRecordRow,
  buildEnrichedReportBundle,
  renderReportCsv,
  renderReportPdf,
} from '../services/reportService.ts';
import {
  assertSafeWebhookUrl,
  createWebhookEndpoint,
  rotateWebhookEndpointSecret,
} from '../services/webhookService.ts';
import {
  fetchCurrentWeather,
  fetchWeeklyForecast,
  geocodeLocation,
} from '../services/weatherService.ts';
import { DEFAULT_STUDY_REGIONS } from '../data/scientificCatalog.ts';

const VALID_MODULES = new Set([
  'delta-risk',
  'crop-health',
  'urban-heat',
  'air-dust',
  'esg-reporting',
  'water-monitoring',
  'trend-alerts',
]);

const VALID_OPERATORS = new Set(['>', '>=', '<', '<=']);

function isAuthenticated(req: RequestWithContext): boolean {
  return Boolean(req.userContext || req.apiKeyContext || req.adminSecretAuthenticated);
}

export const platformRouter = Router();

// PUBLIC: Health probe
platformRouter.get('/health', (req: RequestWithContext, res) => {
  res.json({
    status: 'ok',
    platform: 'CLIMATO',
    engine: 'CLIMATO-Geospatial-Core/2.0',
    requestId: req.requestId,
    dataMode: 'SAMPLE_DEMONSTRATION_WITH_STAGED_CONNECTORS',
    timestamp: new Date().toISOString(),
  });
});

// PUBLIC: Staged satellite connector catalog metadata (non-sensitive)
platformRouter.get('/connectors', (_req, res) => {
  const connectors = listSatelliteConnectors();
  res.json({
    dataProvenance: 'STAGED_CONNECTOR_REGISTRY',
    count: connectors.length,
    connectors,
  });
});

// PROTECTED: Audit logs (platform_admin, org_admin, or X-Climato-Admin-Secret; tenant-scoped for org_admin)
platformRouter.get(
  '/audit-logs',
  requireKeyManagementAuth,
  asyncHandler((req: RequestWithContext, res) => {
    const { limit, offset } = parsePagination(req.query, { limit: 40, maxLimit: 100 });
    const isPlatformAdmin = req.adminSecretAuthenticated || req.userContext?.role === 'platform_admin';

    if (isPlatformAdmin) {
      const logs = db
        .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset);
      res.json({ count: logs.length, limit, offset, logs });
      return;
    }

    const allowedWs = getAllowedWorkspaceIdsForRequest(req);
    const orgId = req.userContext!.organizationId;
    const allLogs = db
      .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 250')
      .all() as Array<{ id: string; actor: string; metadata: string | null }>;
    const filtered = allLogs
      .filter((l) => {
        if (l.metadata?.includes(orgId)) return true;
        if (Array.isArray(allowedWs) && allowedWs.some((ws) => l.metadata?.includes(ws))) return true;
        return false;
      })
      .slice(offset, offset + limit);

    res.json({ count: filtered.length, limit, offset, logs: filtered });
  })
);

// PROTECTED: Workspaces & AOIs (requires authenticated user/key + tenant isolation)
platformRouter.get(
  '/workspaces',
  requireAuthenticated,
  requireRoles('authenticated_user', 'workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const allowed = getAllowedWorkspaceIdsForRequest(req);
    const { limit, offset } = parsePagination(req.query, { limit: 50, maxLimit: 100 });

    let workspaces: unknown[] = [];
    let aois: unknown[] = [];
    if (allowed === '*') {
      workspaces = db
        .prepare('SELECT * FROM workspaces ORDER BY created_at ASC LIMIT ? OFFSET ?')
        .all(limit, offset);
      aois = db
        .prepare('SELECT * FROM aoi_locations ORDER BY id ASC LIMIT ? OFFSET ?')
        .all(limit, offset);
    } else if (allowed.length > 0) {
      const placeholders = allowed.map(() => '?').join(', ');
      workspaces = db
        .prepare(`SELECT * FROM workspaces WHERE id IN (${placeholders}) ORDER BY created_at ASC`)
        .all(...allowed);
      aois = db
        .prepare(`SELECT * FROM aoi_locations WHERE workspace_id IN (${placeholders}) ORDER BY id ASC LIMIT ? OFFSET ?`)
        .all(...allowed, limit, offset);
    }

    res.json({
      isSampleData: true,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      workspaces,
      aois,
    });
  })
);

// PROTECTED: Create AOI (requires workspace_member/org_admin/platform_admin + org quota + tenant ownership)
platformRouter.post(
  '/aois',
  requireAuthenticated,
  requireRoles('workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const {
      workspaceId: requestedWorkspaceId,
      nameEn,
      nameAr,
      lat,
      lon,
      radiusKm = 18,
      regionCode = 'EG-CUSTOM',
      primaryModule = 'delta-risk',
    } = req.body ?? {};

    const workspaceId = resolveTenantWorkspaceId(req, requestedWorkspaceId);
    const numLat = Number(lat);
    const numLon = Number(lon);
    if (
      !nameEn ||
      !String(nameEn).trim() ||
      !Number.isFinite(numLat) ||
      !Number.isFinite(numLon) ||
      numLat < -90 ||
      numLat > 90 ||
      numLon < -180 ||
      numLon > 180
    ) {
      throw new ApiError(400, 'INVALID_AOI', 'nameEn and valid WGS84 numeric lat/lon are required.');
    }
    if (!VALID_MODULES.has(String(primaryModule))) {
      throw new ApiError(400, 'INVALID_MODULE', 'primaryModule must be a valid CLIMATO module ID.');
    }

    const wsRow = db
      .prepare('SELECT id, organization_id, aoi_limit FROM workspaces WHERE id = ?')
      .get(workspaceId) as { id: string; organization_id: string; aoi_limit: number } | undefined;
    if (!wsRow) {
      throw new ApiError(400, 'INVALID_WORKSPACE', `Workspace '${workspaceId}' does not exist.`);
    }

    const currentAois = db
      .prepare('SELECT COUNT(*) as cnt FROM aoi_locations WHERE workspace_id = ?')
      .get(workspaceId) as { cnt: number };
    if (currentAois.cnt >= (wsRow.aoi_limit || 25)) {
      throw new ApiError(429, 'AOI_QUOTA_EXCEEDED', `Workspace '${workspaceId}' reached its AOI quota (${wsRow.aoi_limit}).`);
    }

    const id = `aoi-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    withTransaction(() => {
      db.prepare(`
        INSERT INTO aoi_locations (id, workspace_id, name_en, name_ar, lat, lon, radius_km, region_code, primary_module)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        workspaceId,
        String(nameEn).trim(),
        String(nameAr || nameEn).trim(),
        numLat,
        numLon,
        Number(radiusKm) || 18,
        String(regionCode),
        String(primaryModule)
      );
    });

    recordAuditLog({
      requestId: req.requestId || 'ui',
      actor: req.userContext?.userId || req.apiKeyContext?.id || 'workspace-console',
      action: 'AOI_CREATED',
      resourceType: 'aoi_location',
      resourceId: id,
      metadata: { workspaceId, organizationId: wsRow.organization_id, lat: numLat, lon: numLon },
    });

    const created = db.prepare('SELECT * FROM aoi_locations WHERE id = ?').get(id);
    res.status(201).json({ aoi: created });
  })
);

// PUBLIC STATELESS: Coordinate Risk Analyzer (supports explicit DEMONSTRATION_SAMPLE vs SCIENTIFIC mode)
platformRouter.post(
  '/climate/analyze',
  asyncHandler((req, res) => {
    const lat = Number(req.body?.lat ?? 31.404);
    const lon = Number(req.body?.lon ?? 30.416);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new ApiError(400, 'INVALID_COORDINATES', 'Invalid WGS84 lat/lon coordinates.');
    }
    const mode = String(req.body?.mode || 'DEMONSTRATION_SAMPLE').toUpperCase();
    if (mode === 'SCIENTIFIC') {
      const profile = computeScientificCoordinateProfile(
        lat,
        lon,
        typeof req.body?.datasetId === 'string' ? req.body.datasetId : undefined
      );
      res.json({ requestId: req.requestId, ...profile });
      return;
    }
    const profile = computeCoordinateRiskProfile(lat, lon);
    res.json({ requestId: req.requestId, ...profile });
  })
);

// PUBLIC: Live weather & forecast proxy (Open-Meteo)
platformRouter.get(
  '/weather/current',
  asyncHandler(async (req, res) => {
    const regionId = typeof req.query.regionId === 'string' ? req.query.regionId.trim() : '';
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const hasLatLon = req.query.lat !== undefined && req.query.lon !== undefined;

    let target: {
      lat: number;
      lon: number;
      name?: string;
      region?: string;
      country?: string;
      timezone?: string;
      regionId?: string;
    };

    if (regionId) {
      const dbRow = db
        .prepare('SELECT id, name_en, center_lat, center_lon FROM study_regions WHERE id = ?')
        .get(regionId) as
        | { id: string; name_en: string; center_lat: number; center_lon: number }
        | undefined;
      const fallback = DEFAULT_STUDY_REGIONS.find((r) => r.id === regionId);
      if (dbRow) {
        target = {
          lat: dbRow.center_lat,
          lon: dbRow.center_lon,
          name: dbRow.name_en,
          country: 'Egypt',
          timezone: 'Africa/Cairo',
          regionId: dbRow.id,
        };
      } else if (fallback) {
        target = {
          lat: fallback.centerLat,
          lon: fallback.centerLon,
          name: fallback.nameEn,
          country: 'Egypt',
          timezone: 'Africa/Cairo',
          regionId: fallback.id,
        };
      } else {
        throw new ApiError(404, 'STUDY_REGION_NOT_FOUND', `Unknown study region '${regionId}'.`);
      }
    } else if (query) {
      let resolved: Awaited<ReturnType<typeof geocodeLocation>> = null;
      try {
        resolved = await geocodeLocation(query);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Geocoding upstream error';
        throw new ApiError(502, 'WEATHER_GEOCODING_UNAVAILABLE', message);
      }
      if (!resolved) {
        throw new ApiError(404, 'LOCATION_NOT_FOUND', `No location matched "${query}".`);
      }
      target = resolved;
    } else if (hasLatLon) {
      const lat = Number(req.query.lat);
      const lon = Number(req.query.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new ApiError(400, 'INVALID_COORDINATES', 'Invalid WGS84 lat/lon coordinates.');
      }
      target = {
        lat,
        lon,
        name: typeof req.query.name === 'string' ? req.query.name.trim() : undefined,
      };
    } else {
      target = {
        lat: 30.0444,
        lon: 31.2357,
        name: 'Cairo',
        region: 'Cairo Governorate',
        country: 'Egypt',
        timezone: 'Africa/Cairo',
        regionId: 'greater-cairo',
      };
    }

    try {
      const weather = await fetchCurrentWeather(target);
      res.json({
        requestId: req.requestId,
        ...weather,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Weather upstream unavailable';
      throw new ApiError(502, 'WEATHER_UPSTREAM_UNAVAILABLE', message);
    }
  })
);

platformRouter.get(
  '/weather/forecast',
  asyncHandler(async (req, res) => {
    const regionId = typeof req.query.regionId === 'string' ? req.query.regionId.trim() : '';
    let lat: number;
    let lon: number;
    let resolvedRegionId: string | undefined;

    if (regionId) {
      const dbRow = db
        .prepare('SELECT id, center_lat, center_lon FROM study_regions WHERE id = ?')
        .get(regionId) as { id: string; center_lat: number; center_lon: number } | undefined;
      const fallback = DEFAULT_STUDY_REGIONS.find((r) => r.id === regionId);
      if (dbRow) {
        lat = dbRow.center_lat;
        lon = dbRow.center_lon;
        resolvedRegionId = dbRow.id;
      } else if (fallback) {
        lat = fallback.centerLat;
        lon = fallback.centerLon;
        resolvedRegionId = fallback.id;
      } else {
        throw new ApiError(404, 'STUDY_REGION_NOT_FOUND', `Unknown study region '${regionId}'.`);
      }
    } else if (req.query.lat !== undefined && req.query.lon !== undefined) {
      lat = Number(req.query.lat);
      lon = Number(req.query.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new ApiError(400, 'INVALID_COORDINATES', 'Invalid WGS84 lat/lon coordinates.');
      }
    } else {
      const def = DEFAULT_STUDY_REGIONS[0];
      lat = def.centerLat;
      lon = def.centerLon;
      resolvedRegionId = def.id;
    }

    try {
      const forecast = await fetchWeeklyForecast({ lat, lon, regionId: resolvedRegionId });
      res.json({
        requestId: req.requestId,
        ...forecast,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Forecast upstream unavailable';
      throw new ApiError(502, 'FORECAST_UPSTREAM_UNAVAILABLE', message);
    }
  })
);

// SCOPED: Observations (public returns ONLY seeded demonstration rows; authenticated returns tenant-scoped rows)
platformRouter.get(
  '/observations',
  asyncHandler((req: RequestWithContext, res) => {
    const { moduleId, aoiId } = req.query;
    const { limit, offset } = parsePagination(req.query, { limit: 100, maxLimit: 200 });

    let query =
      'SELECT o.*, a.name_en as aoi_name_en, a.name_ar as aoi_name_ar, a.lat, a.lon, a.workspace_id FROM sample_observations o JOIN aoi_locations a ON o.aoi_id = a.id JOIN workspaces w ON w.id = a.workspace_id WHERE 1=1';
    const params: Array<string | number> = [];

    if (isAuthenticated(req)) {
      const allowed = getAllowedWorkspaceIdsForRequest(req);
      if (typeof aoiId === 'string' && aoiId !== 'all') {
        const aoiRow = db
          .prepare('SELECT id, workspace_id FROM aoi_locations WHERE id = ?')
          .get(aoiId) as { id: string; workspace_id: string } | undefined;
        if (aoiRow) {
          assertTenantRecordOwnership(req, aoiRow.workspace_id, `AOI '${aoiId}'`);
        }
      }
      if (allowed !== '*') {
        if (allowed.length === 0) {
          res.json({ isSampleData: true, dataProvenance: 'SAMPLE_DEMONSTRATION', observations: [] });
          return;
        }
        const ph = allowed.map(() => '?').join(', ');
        query += ` AND a.workspace_id IN (${ph})`;
        params.push(...allowed);
      }
    } else {
      // Public unauthenticated view restricted strictly to public seeded sandbox samples
      query += ` AND o.is_sample_data = 1 AND w.organization_id IN ('org-nile-agro', 'org-coastal-finance')`;
    }

    if (typeof moduleId === 'string' && moduleId !== 'all') {
      query += ' AND o.module_id = ?';
      params.push(moduleId);
    }
    if (typeof aoiId === 'string' && aoiId !== 'all') {
      query += ' AND o.aoi_id = ?';
      params.push(aoiId);
    }
    query += ' ORDER BY o.id ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params);
    res.json({
      isSampleData: true,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      notice: 'Sample dataset for platform demonstration. Not verified live satellite measurements.',
      limit,
      offset,
      observations: rows,
    });
  })
);

// PROTECTED: Alerts CRUD & Real Evaluation (tenant-isolated)
platformRouter.get(
  '/alerts',
  requireAuthenticated,
  requireRoles('authenticated_user', 'workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const { moduleId, workspaceId } = req.query;
    const { limit, offset } = parsePagination(req.query, { limit: 25, maxLimit: 100 });
    const allowed = getAllowedWorkspaceIdsForRequest(req);

    if (typeof workspaceId === 'string' && workspaceId !== 'all') {
      assertTenantRecordOwnership(req, workspaceId, `workspace '${workspaceId}' alerts`);
    }

    let query = 'SELECT * FROM trend_alerts WHERE 1=1';
    const params: Array<string | number> = [];

    if (allowed !== '*') {
      if (allowed.length === 0) {
        res.json({ isSampleData: true, alerts: [] });
        return;
      }
      const ph = allowed.map(() => '?').join(', ');
      query += ` AND workspace_id IN (${ph})`;
      params.push(...allowed);
    }

    if (typeof moduleId === 'string' && moduleId !== 'all') {
      query += ' AND module_id = ?';
      params.push(moduleId);
    }
    if (typeof workspaceId === 'string' && workspaceId !== 'all') {
      query += ' AND workspace_id = ?';
      params.push(workspaceId);
    }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const alerts = db.prepare(query).all(...params);
    res.json({ isSampleData: true, limit, offset, alerts });
  })
);

platformRouter.post(
  '/alerts',
  requireAuthenticated,
  requireRoles('workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const {
      workspaceId: requestedWorkspaceId,
      titleEn,
      titleAr,
      moduleId,
      lat,
      lon,
      radiusKm = 15,
      metricKey,
      operator = '>',
      thresholdValue,
      unit,
      severity = 'Elevated',
      channel = 'Webhook + Email',
    } = req.body ?? {};

    const workspaceId = resolveTenantWorkspaceId(req, requestedWorkspaceId);
    if (
      !titleEn ||
      !moduleId ||
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180 ||
      typeof thresholdValue !== 'number' ||
      !Number.isFinite(thresholdValue)
    ) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Missing or invalid alert parameters (titleEn, moduleId, valid lat, valid lon, thresholdValue).'
      );
    }
    if (!VALID_MODULES.has(String(moduleId))) {
      throw new ApiError(400, 'INVALID_MODULE', 'moduleId must be a valid CLIMATO module ID.');
    }
    if (!VALID_OPERATORS.has(String(operator))) {
      throw new ApiError(400, 'INVALID_OPERATOR', 'operator must be one of >, >=, <, <=.');
    }

    const id = `alt-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const now = new Date().toISOString();
    withTransaction(() => {
      db.prepare(`
        INSERT INTO trend_alerts (id, workspace_id, title_en, title_ar, module_id, lat, lon, radius_km, metric_key, operator, threshold_value, unit, severity, channel, enabled, last_evaluated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        id,
        workspaceId,
        String(titleEn).trim(),
        String(titleAr || titleEn).trim(),
        String(moduleId),
        lat,
        lon,
        Number(radiusKm) || 15,
        String(metricKey || 'anomaly_index'),
        String(operator),
        thresholdValue,
        String(unit || 'idx'),
        String(severity),
        String(channel),
        now,
        now
      );
    });

    recordAuditLog({
      requestId: req.requestId || 'ui',
      actor: req.userContext?.userId || req.apiKeyContext?.id || 'alerts-console',
      action: 'ALERT_CREATED',
      resourceType: 'trend_alert',
      resourceId: id,
      metadata: { workspaceId, moduleId, thresholdValue },
    });

    const created = db.prepare('SELECT * FROM trend_alerts WHERE id = ?').get(id);
    res.status(201).json({ alert: created });
  })
);

platformRouter.post(
  '/alerts/:id/evaluate',
  requireAuthenticated,
  requireRoles('workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler(async (req: RequestWithContext, res) => {
    const id = String(req.params.id);
    const existing = db
      .prepare('SELECT id, workspace_id FROM trend_alerts WHERE id = ?')
      .get(id) as { id: string; workspace_id: string } | undefined;
    if (!existing) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', 'Alert rule not found.');
    }
    assertTenantRecordOwnership(req, existing.workspace_id, `alert '${id}'`);

    const explicitWebhookUrl =
      typeof req.body?.webhookUrl === 'string' && req.body.webhookUrl.trim()
        ? req.body.webhookUrl.trim()
        : undefined;

    const evaluations = await evaluateGeofenceAlerts(
      id,
      req.requestId || 'ui-eval',
      explicitWebhookUrl
    );
    res.json({ evaluation: evaluations[0] });
  })
);

platformRouter.get(
  '/alerts/:id/evaluations',
  requireAuthenticated,
  requireRoles('authenticated_user', 'workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const id = String(req.params.id);
    const existing = db
      .prepare('SELECT id, workspace_id FROM trend_alerts WHERE id = ?')
      .get(id) as { id: string; workspace_id: string } | undefined;
    if (!existing) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', 'Alert rule not found.');
    }
    assertTenantRecordOwnership(req, existing.workspace_id, `alert '${id}'`);

    const { limit, offset } = parsePagination(req.query, { limit: 20, maxLimit: 100 });
    const rows = db
      .prepare('SELECT * FROM alert_evaluations WHERE alert_id = ? ORDER BY evaluated_at DESC LIMIT ? OFFSET ?')
      .all(id, limit, offset);
    res.json({ evaluations: rows });
  })
);

platformRouter.patch(
  '/alerts/:id',
  requireAuthenticated,
  requireRoles('workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const id = String(req.params.id);
    const { enabled } = req.body ?? {};
    const existing = db
      .prepare('SELECT * FROM trend_alerts WHERE id = ?')
      .get(id) as { id: string; workspace_id: string } | undefined;
    if (!existing) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', 'Alert not found');
    }
    assertTenantRecordOwnership(req, existing.workspace_id, `alert '${id}'`);

    db.prepare('UPDATE trend_alerts SET enabled = ?, last_evaluated_at = ? WHERE id = ?').run(
      enabled ? 1 : 0,
      new Date().toISOString(),
      id
    );
    const updated = db.prepare('SELECT * FROM trend_alerts WHERE id = ?').get(id);
    res.json({ alert: updated });
  })
);

platformRouter.delete(
  '/alerts/:id',
  requireAuthenticated,
  requireRoles('workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const id = String(req.params.id);
    const existing = db
      .prepare('SELECT id, workspace_id FROM trend_alerts WHERE id = ?')
      .get(id) as { id: string; workspace_id: string } | undefined;
    if (!existing) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', 'Alert not found');
    }
    assertTenantRecordOwnership(req, existing.workspace_id, `alert '${id}'`);

    db.prepare('DELETE FROM trend_alerts WHERE id = ?').run(id);
    res.json({ deleted: true, id });
  })
);

// PROTECTED: Webhook endpoint management & delivery audit (tenant-isolated)
platformRouter.get(
  '/webhooks',
  requireAuthenticated,
  requireRoles('workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const allowed = getAllowedWorkspaceIdsForRequest(req);
    const { limit, offset } = parsePagination(req.query, { limit: 25, maxLimit: 100 });
    const rows =
      allowed === '*'
        ? db
            .prepare(
              'SELECT id, workspace_id, organization_id, name as label, url as target_url, secret_prefix, enabled, created_at, rotated_at, updated_at FROM webhook_endpoints ORDER BY created_at DESC LIMIT ? OFFSET ?'
            )
            .all(limit, offset)
        : allowed.length === 0
        ? []
        : db
            .prepare(
              `SELECT id, workspace_id, organization_id, name as label, url as target_url, secret_prefix, enabled, created_at, rotated_at, updated_at
               FROM webhook_endpoints WHERE workspace_id IN (${allowed.map(() => '?').join(', ')})
               ORDER BY created_at DESC LIMIT ? OFFSET ?`
            )
            .all(...allowed, limit, offset);
    res.json({ endpoints: rows });
  })
);

platformRouter.post(
  '/webhooks',
  requireAuthenticated,
  requireRoles('workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler(async (req: RequestWithContext, res) => {
    const { workspaceId: requestedWs, label, targetUrl } = req.body ?? {};
    const workspaceId = resolveTenantWorkspaceId(req, requestedWs);
    if (!label || !String(label).trim() || !targetUrl || !String(targetUrl).trim()) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'label and targetUrl are required.');
    }
    try {
      await assertSafeWebhookUrl(String(targetUrl));
    } catch (err) {
      throw new ApiError(400, 'INVALID_WEBHOOK_URL', err instanceof Error ? err.message : 'Invalid webhook URL.');
    }

    const created = createWebhookEndpoint({
      workspaceId,
      label: String(label),
      targetUrl: String(targetUrl),
      requestId: req.requestId,
      actor: req.userContext?.userId || req.apiKeyContext?.id || 'webhook-console',
    });

    res.status(201).json({
      endpoint: created.endpoint,
      signingSecret: created.rawSecret,
    });
  })
);

platformRouter.post(
  '/webhooks/:id/rotate-secret',
  requireAuthenticated,
  requireRoles('org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const id = String(req.params.id);
    const existing = db
      .prepare('SELECT id, workspace_id FROM webhook_endpoints WHERE id = ?')
      .get(id) as { id: string; workspace_id: string } | undefined;
    if (!existing) {
      throw new ApiError(404, 'WEBHOOK_NOT_FOUND', 'Webhook endpoint not found.');
    }
    assertTenantRecordOwnership(req, existing.workspace_id, `webhook '${id}'`);

    const rotated = rotateWebhookEndpointSecret({
      endpointId: id,
      requestId: req.requestId,
      actor: req.userContext?.userId || 'org-admin',
    });
    res.json(rotated);
  })
);

platformRouter.get(
  '/webhooks/:id/deliveries',
  requireAuthenticated,
  requireRoles('workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const id = String(req.params.id);
    const existing = db
      .prepare('SELECT id, workspace_id FROM webhook_endpoints WHERE id = ?')
      .get(id) as { id: string; workspace_id: string } | undefined;
    if (!existing) {
      throw new ApiError(404, 'WEBHOOK_NOT_FOUND', 'Webhook endpoint not found.');
    }
    assertTenantRecordOwnership(req, existing.workspace_id, `webhook '${id}'`);

    const { limit, offset } = parsePagination(req.query, { limit: 25, maxLimit: 100 });
    const deliveries = db
      .prepare('SELECT * FROM webhook_deliveries WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(id, limit, offset);
    res.json({ deliveries });
  })
);

// PROTECTED: Reports CRUD & Export (JSON, CSV, PDF; tenant-isolated)
platformRouter.get(
  '/reports',
  requireAuthenticated,
  requireRoles('authenticated_user', 'workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const allowed = getAllowedWorkspaceIdsForRequest(req);
    const { limit, offset } = parsePagination(req.query, { limit: 25, maxLimit: 100 });
    const reports =
      allowed === '*'
        ? db.prepare('SELECT * FROM report_requests ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset)
        : allowed.length === 0
        ? []
        : db
            .prepare(
              `SELECT * FROM report_requests WHERE workspace_id IN (${allowed.map(() => '?').join(', ')})
               ORDER BY created_at DESC LIMIT ? OFFSET ?`
            )
            .all(...allowed, limit, offset);
    res.json({ isSampleData: true, limit, offset, reports });
  })
);

platformRouter.post(
  '/reports',
  requireAuthenticated,
  requireRoles('workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const {
      workspaceId: requestedWorkspaceId,
      organizationName,
      sector,
      standard,
      moduleIds,
      lat,
      lon,
      reportType = 'Standard Sandbox Export',
      studyRegionId = null,
    } = req.body ?? {};

    const workspaceId = resolveTenantWorkspaceId(req, requestedWorkspaceId);
    if (!organizationName || !sector || !standard || !Array.isArray(moduleIds) || moduleIds.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'organizationName, sector, standard, and moduleIds are required.');
    }

    const numLat = Number(lat ?? 30.044);
    const numLon = Number(lon ?? 31.235);
    if (!Number.isFinite(numLat) || !Number.isFinite(numLon) || numLat < -90 || numLat > 90 || numLon < -180 || numLon > 180) {
      throw new ApiError(400, 'INVALID_COORDINATES', 'Invalid WGS84 lat/lon coordinates.');
    }

    const id = `rep-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const now = new Date().toISOString();
    const status = reportType === 'Custom Paid Report Request' ? 'SCOPING_REVIEW' : 'READY_SAMPLE';

    withTransaction(() => {
      db.prepare(`
        INSERT INTO report_requests (
          id, workspace_id, organization_name, sector, standard, module_ids, lat, lon,
          report_type, status, data_provenance, study_region_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAMPLE_DEMONSTRATION', ?, ?)
      `).run(
        id,
        workspaceId,
        String(organizationName).trim(),
        String(sector),
        String(standard),
        moduleIds.join(','),
        numLat,
        numLon,
        String(reportType),
        status,
        studyRegionId ? String(studyRegionId) : null,
        now
      );
    });

    recordAuditLog({
      requestId: req.requestId || 'ui',
      actor: req.userContext?.userId || req.apiKeyContext?.id || 'reports-studio',
      action: 'REPORT_CREATED',
      resourceType: 'report',
      resourceId: id,
      metadata: { workspaceId, standard, organizationName },
    });

    const created = db.prepare('SELECT * FROM report_requests WHERE id = ?').get(id);
    res.status(201).json({ report: created });
  })
);

platformRouter.get(
  '/reports/:id/export',
  requireAuthenticated,
  requireRoles('authenticated_user', 'workspace_member', 'org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const id = String(req.params.id);
    const format = String(req.query.format || 'json').toLowerCase();
    const report = db.prepare('SELECT * FROM report_requests WHERE id = ?').get(id) as
      | ReportRecordRow
      | undefined;

    if (!report) {
      throw new ApiError(404, 'REPORT_NOT_FOUND', `Report '${id}' not found.`);
    }
    assertTenantRecordOwnership(req, report.workspace_id, `report '${id}'`);

    const bundle = buildEnrichedReportBundle(report);
    db.prepare(
      'UPDATE report_requests SET study_region_id = COALESCE(study_region_id, ?), report_payload_json = ? WHERE id = ?'
    ).run(bundle.scientificSummary.studyRegion.id, JSON.stringify(bundle), id);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${id}-climate-report.csv"`);
      res.send(renderReportCsv(bundle));
      return;
    }

    if (format === 'pdf') {
      const pdfBuffer = renderReportPdf(bundle);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${id}-climate-report.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}-climate-report.json"`);
    res.json(bundle);
  })
);

// PROTECTED: Commercial & Admin Monitoring Overview
platformRouter.get(
  '/admin/overview',
  requireRoles('platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const isPlatformAdmin = req.adminSecretAuthenticated || req.userContext?.role === 'platform_admin';
    const orgFilter = !isPlatformAdmin && req.userContext ? req.userContext.organizationId : null;
    const monthPrefix = new Date().toISOString().slice(0, 7);

    const orgs = orgFilter
      ? db.prepare('SELECT * FROM organizations WHERE id = ?').all(orgFilter)
      : db.prepare('SELECT * FROM organizations ORDER BY created_at DESC').all();

    const usageByOrg = orgFilter
      ? db
          .prepare(
            `SELECT organization_id, COUNT(*) as requests_this_month, AVG(latency_ms) as avg_latency_ms
             FROM api_usage_logs WHERE organization_id = ? AND created_at LIKE ? GROUP BY organization_id`
          )
          .all(orgFilter, `${monthPrefix}%`)
      : db
          .prepare(
            `SELECT organization_id, COUNT(*) as requests_this_month, AVG(latency_ms) as avg_latency_ms
             FROM api_usage_logs WHERE created_at LIKE ? GROUP BY organization_id`
          )
          .all(`${monthPrefix}%`);

    const deliverySummary = db
      .prepare('SELECT status, COUNT(*) as count FROM webhook_deliveries GROUP BY status')
      .all();

    res.json({
      month: monthPrefix,
      organizations: orgs,
      usageByOrganization: usageByOrg,
      webhookDeliveriesSummary: deliverySummary,
    });
  })
);

// PROTECTED: View Demo Requests
platformRouter.get('/demo-requests', requireKeyManagementAuth, (req: RequestWithContext, res) => {
  const { limit, offset } = parsePagination(req.query, { limit: 20, maxLimit: 100 });
  const requests = db
    .prepare('SELECT * FROM demo_requests ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset);
  res.json({ limit, offset, requests });
});

// PUBLIC: Demo Request Intake (hardened against brute-force / spam)
platformRouter.post(
  '/demo-requests',
  authBruteForceRateLimiter,
  asyncHandler((req, res) => {
    const {
      fullName,
      workEmail,
      organization,
      sector,
      planInterest = 'Sector Pro Tier',
      modulesInterested = [],
      notes = '',
      website = '',
    } = req.body ?? {};

    // Honeypot anti-bot field
    if (typeof website === 'string' && website.trim().length > 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid demo request submission.');
    }

    if (!fullName || !workEmail || !organization || !sector) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Please complete all required fields: fullName, workEmail, organization, and sector.');
    }

    const cleanName = String(fullName).trim();
    const cleanEmail = String(workEmail).trim().toLowerCase();
    const cleanOrg = String(organization).trim();
    const cleanNotes = String(notes).trim();

    if (cleanName.length > 160 || cleanOrg.length > 200 || cleanNotes.length > 2000) {
      throw new ApiError(400, 'INPUT_TOO_LONG', 'Submitted field exceeds allowed character length.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      throw new ApiError(400, 'INVALID_EMAIL', 'Please enter a valid work email address.');
    }

    const id = `REQ-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const modulesText = Array.isArray(modulesInterested) ? modulesInterested.join(',') : String(modulesInterested || '');

    db.prepare(`
      INSERT INTO demo_requests (id, full_name, work_email, organization, sector, plan_interest, modules_interested, notes, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?)
    `).run(id, cleanName, cleanEmail, cleanOrg, String(sector), String(planInterest), modulesText, cleanNotes, now);

    recordAuditLog({
      requestId: req.requestId || 'ui',
      actor: 'public-demo-intake',
      action: 'DEMO_REQUEST_RECORDED',
      resourceType: 'demo_request',
      resourceId: id,
      metadata: { organization: cleanOrg, planInterest },
    });

    res.status(201).json({
      referenceId: id,
      status: 'RECEIVED',
      createdAt: now,
    });
  })
);
