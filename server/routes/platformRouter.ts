import { Router } from 'express';
import { db, recordAuditLog } from '../db/database.ts';
import { listSatelliteConnectors } from '../connectors/satelliteRegistry.ts';
import {
  ApiError,
  RequestWithContext,
  asyncHandler,
  requireKeyManagementAuth,
} from '../middleware/requestContext.ts';
import {
  computeCoordinateRiskProfile,
  evaluateGeofenceAlerts,
} from '../services/geospatialEngine.ts';
import {
  fetchCurrentWeather,
  fetchWeeklyForecast,
  geocodeLocation,
} from '../services/weatherService.ts';
import { DEFAULT_STUDY_REGIONS } from '../data/scientificCatalog.ts';

export const platformRouter = Router();

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

platformRouter.get('/connectors', (_req, res) => {
  const connectors = listSatelliteConnectors();
  res.json({
    dataProvenance: 'STAGED_CONNECTOR_REGISTRY',
    count: connectors.length,
    connectors,
  });
});

platformRouter.get('/audit-logs', requireKeyManagementAuth, (_req, res) => {
  const logs = db
    .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 40')
    .all();
  res.json({ count: logs.length, logs });
});

platformRouter.get('/workspaces', (_req, res) => {
  const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC').all();
  const aois = db.prepare('SELECT * FROM aoi_locations ORDER BY id ASC').all();
  res.json({
    isSampleData: true,
    dataProvenance: 'SAMPLE_DEMONSTRATION',
    workspaces,
    aois,
  });
});

platformRouter.post(
  '/aois',
  asyncHandler((req, res) => {
    const {
      workspaceId = 'ws-delta-agro',
      nameEn,
      nameAr,
      lat,
      lon,
      radiusKm = 18,
      regionCode = 'EG-CUSTOM',
      primaryModule = 'delta-risk',
    } = req.body ?? {};

    const numLat = Number(lat);
    const numLon = Number(lon);
    if (!nameEn || !String(nameEn).trim() || !Number.isFinite(numLat) || !Number.isFinite(numLon)) {
      throw new ApiError(400, 'INVALID_AOI', 'nameEn, numeric lat, and numeric lon are required.');
    }

    const wsExists = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(String(workspaceId));
    if (!wsExists) {
      throw new ApiError(400, 'INVALID_WORKSPACE', `Workspace '${workspaceId}' does not exist.`);
    }

    const id = `aoi-${Date.now().toString(36)}`;
    db.prepare(`
      INSERT INTO aoi_locations (id, workspace_id, name_en, name_ar, lat, lon, radius_km, region_code, primary_module)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      String(workspaceId),
      String(nameEn).trim(),
      String(nameAr || nameEn).trim(),
      numLat,
      numLon,
      Number(radiusKm) || 18,
      String(regionCode),
      String(primaryModule)
    );

    recordAuditLog({
      requestId: req.requestId || 'ui',
      actor: 'workspace-console',
      action: 'AOI_CREATED',
      resourceType: 'aoi_location',
      resourceId: id,
      metadata: { workspaceId, lat: numLat, lon: numLon },
    });

    const created = db.prepare('SELECT * FROM aoi_locations WHERE id = ?').get(id);
    res.status(201).json({ aoi: created });
  })
);

platformRouter.post(
  '/climate/analyze',
  asyncHandler((req, res) => {
    const lat = Number(req.body?.lat ?? 31.404);
    const lon = Number(req.body?.lon ?? 30.416);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new ApiError(400, 'INVALID_COORDINATES', 'Invalid WGS84 lat/lon coordinates.');
    }
    const profile = computeCoordinateRiskProfile(lat, lon);
    res.json({ requestId: req.requestId, ...profile });
  })
);

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

platformRouter.get('/observations', (req, res) => {
  const { moduleId, aoiId } = req.query;
  let query =
    'SELECT o.*, a.name_en as aoi_name_en, a.name_ar as aoi_name_ar, a.lat, a.lon, a.workspace_id FROM sample_observations o JOIN aoi_locations a ON o.aoi_id = a.id WHERE 1=1';
  const params: string[] = [];

  if (typeof moduleId === 'string' && moduleId !== 'all') {
    query += ' AND o.module_id = ?';
    params.push(moduleId);
  }
  if (typeof aoiId === 'string' && aoiId !== 'all') {
    query += ' AND o.aoi_id = ?';
    params.push(aoiId);
  }
  query += ' ORDER BY o.id ASC';

  const rows = db.prepare(query).all(...params);
  res.json({
    isSampleData: true,
    dataProvenance: 'SAMPLE_DEMONSTRATION',
    notice: 'Sample dataset for platform demonstration. Not verified live satellite measurements.',
    observations: rows,
  });
});

platformRouter.get('/alerts', (req, res) => {
  const { moduleId, workspaceId } = req.query;
  let query = 'SELECT * FROM trend_alerts WHERE 1=1';
  const params: string[] = [];
  if (typeof moduleId === 'string' && moduleId !== 'all') {
    query += ' AND module_id = ?';
    params.push(moduleId);
  }
  if (typeof workspaceId === 'string' && workspaceId !== 'all') {
    query += ' AND workspace_id = ?';
    params.push(workspaceId);
  }
  query += ' ORDER BY created_at DESC';
  const alerts = db.prepare(query).all(...params);
  res.json({ isSampleData: true, alerts });
});

platformRouter.post(
  '/alerts',
  asyncHandler((req, res) => {
    const {
      workspaceId = 'ws-delta-agro',
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

    if (!titleEn || !moduleId || typeof lat !== 'number' || typeof lon !== 'number' || typeof thresholdValue !== 'number') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Missing required alert parameters (titleEn, moduleId, lat, lon, thresholdValue).');
    }

    const id = `alt-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
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

    recordAuditLog({
      requestId: req.requestId || 'ui',
      actor: 'alerts-console',
      action: 'ALERT_CREATED',
      resourceType: 'trend_alert',
      resourceId: id,
      metadata: { moduleId, thresholdValue },
    });

    const created = db.prepare('SELECT * FROM trend_alerts WHERE id = ?').get(id);
    res.status(201).json({ alert: created });
  })
);

platformRouter.post(
  '/alerts/:id/evaluate',
  asyncHandler((req, res) => {
    const id = String(req.params.id);
    const existing = db.prepare('SELECT id FROM trend_alerts WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', 'Alert rule not found.');
    }
    const evaluations = evaluateGeofenceAlerts(id, req.requestId || 'ui-eval');
    res.json({ evaluation: evaluations[0] });
  })
);

platformRouter.get('/alerts/:id/evaluations', (req, res) => {
  const id = String(req.params.id);
  const rows = db
    .prepare('SELECT * FROM alert_evaluations WHERE alert_id = ? ORDER BY evaluated_at DESC LIMIT 10')
    .all(id);
  res.json({ evaluations: rows });
});

platformRouter.patch(
  '/alerts/:id',
  asyncHandler((req, res) => {
    const id = String(req.params.id);
    const { enabled } = req.body ?? {};
    const existing = db.prepare('SELECT * FROM trend_alerts WHERE id = ?').get(id);
    if (!existing) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', 'Alert not found');
    }
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
  asyncHandler((req, res) => {
    const id = String(req.params.id);
    const result = db.prepare('DELETE FROM trend_alerts WHERE id = ?').run(id);
    if (result.changes === 0) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', 'Alert not found');
    }
    res.json({ deleted: true, id });
  })
);

platformRouter.get('/reports', (_req, res) => {
  const reports = db.prepare('SELECT * FROM report_requests ORDER BY created_at DESC').all();
  res.json({ isSampleData: true, reports });
});

platformRouter.post(
  '/reports',
  asyncHandler((req, res) => {
    const {
      workspaceId = 'ws-coastal-banking',
      organizationName,
      sector,
      standard,
      moduleIds,
      lat,
      lon,
      reportType = 'Standard Sandbox Export',
    } = req.body ?? {};

    if (!organizationName || !sector || !standard || !Array.isArray(moduleIds) || moduleIds.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'organizationName, sector, standard, and moduleIds are required.');
    }

    const id = `rep-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const status = reportType === 'Custom Paid Report Request' ? 'SCOPING_REVIEW' : 'READY_SAMPLE';

    db.prepare(`
      INSERT INTO report_requests (id, workspace_id, organization_name, sector, standard, module_ids, lat, lon, report_type, status, data_provenance, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SAMPLE_DEMONSTRATION', ?)
    `).run(
      id,
      workspaceId,
      String(organizationName).trim(),
      String(sector),
      String(standard),
      moduleIds.join(','),
      Number(lat) || 30.044,
      Number(lon) || 31.235,
      reportType,
      status,
      now
    );

    recordAuditLog({
      requestId: req.requestId || 'ui',
      actor: 'reports-studio',
      action: 'REPORT_CREATED',
      resourceType: 'report',
      resourceId: id,
      metadata: { standard, organizationName },
    });

    const created = db.prepare('SELECT * FROM report_requests WHERE id = ?').get(id);
    res.status(201).json({ report: created });
  })
);

platformRouter.get('/reports/:id/export', (req, res) => {
  const { id } = req.params;
  const format = String(req.query.format || 'json').toLowerCase();
  const report = db.prepare('SELECT * FROM report_requests WHERE id = ?').get(id) as Record<string, unknown> | undefined;

  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  const observations = db.prepare('SELECT * FROM sample_observations LIMIT 16').all() as Array<Record<string, unknown>>;

  if (format === 'csv') {
    const headers = ['report_id', 'organization', 'standard', 'data_provenance', 'aoi_id', 'module_id', 'source_name', 'period_label', 'metric_key', 'metric_value', 'unit'];
    const lines = [headers.join(',')];
    for (const obs of observations) {
      lines.push(
        [
          report.id,
          `"${String(report.organization_name).replace(/"/g, '""')}"`,
          `"${String(report.standard)}"`,
          'SAMPLE_DEMONSTRATION_NOT_LIVE',
          obs.aoi_id,
          obs.module_id,
          `"${String(obs.source_name)}"`,
          obs.period_label,
          obs.metric_key,
          obs.metric_value,
          obs.unit,
        ].join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}-sample-climate-report.csv"`);
    res.send(lines.join('\n'));
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${id}-sample-climate-report.json"`);
  res.json({
    disclaimer: 'SAMPLE DEMONSTRATION REPORT — Generated from platform sandbox records. Connect verified satellite workers for audited production disclosures.',
    report,
    sampleObservationsIncluded: observations,
    exportedAt: new Date().toISOString(),
  });
});

platformRouter.get('/demo-requests', requireKeyManagementAuth, (_req, res) => {
  const requests = db.prepare('SELECT * FROM demo_requests ORDER BY created_at DESC LIMIT 20').all();
  res.json({ requests });
});

platformRouter.post(
  '/demo-requests',
  asyncHandler((req, res) => {
    const {
      fullName,
      workEmail,
      organization,
      sector,
      planInterest = 'Sector Pro Tier',
      modulesInterested = [],
      notes = '',
    } = req.body ?? {};

    if (!fullName || !workEmail || !organization || !sector) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Please complete all required fields: fullName, workEmail, organization, and sector.');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(workEmail))) {
      throw new ApiError(400, 'INVALID_EMAIL', 'Please enter a valid work email address.');
    }

    const id = `REQ-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const modulesText = Array.isArray(modulesInterested) ? modulesInterested.join(',') : String(modulesInterested || '');

    db.prepare(`
      INSERT INTO demo_requests (id, full_name, work_email, organization, sector, plan_interest, modules_interested, notes, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?)
    `).run(id, String(fullName).trim(), String(workEmail).trim(), String(organization).trim(), String(sector), String(planInterest), modulesText, String(notes).trim(), now);

    recordAuditLog({
      requestId: req.requestId || 'ui',
      actor: 'public-demo-intake',
      action: 'DEMO_REQUEST_RECORDED',
      resourceType: 'demo_request',
      resourceId: id,
      metadata: { organization: String(organization).trim(), planInterest },
    });

    res.status(201).json({
      referenceId: id,
      status: 'RECEIVED',
      createdAt: now,
    });
  })
);
