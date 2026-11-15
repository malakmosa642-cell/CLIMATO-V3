import crypto from 'node:crypto';
import { Router } from 'express';
import { db, recordAuditLog } from '../db/database.ts';
import { hashApiToken, maskApiToken } from '../db/migrations.ts';
import { executeStagedPreview, listSatelliteConnectors } from '../connectors/satelliteRegistry.ts';
import {
  ApiError,
  RequestWithContext,
  assertTenantRecordOwnership,
  asyncHandler,
  requireKeyManagementAuth,
  requireScope,
  resolveTenantWorkspaceId,
  v1AuthAndRateLimit,
} from '../middleware/requestContext.ts';
import {
  computeCoordinateRiskProfile,
  evaluateGeofenceAlerts,
} from '../services/geospatialEngine.ts';

const VALID_MODULES = new Set([
  'delta-risk',
  'crop-health',
  'urban-heat',
  'air-dust',
  'esg-reporting',
  'water-monitoring',
  'trend-alerts',
]);

const VALID_ALERT_OPERATORS = new Set(['>', '>=', '<', '<=']);

function assertValidCoordinates(latRaw: unknown, lonRaw: unknown): { lat: number; lon: number } {
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new ApiError(
      400,
      'INVALID_COORDINATES',
      'Invalid WGS84 coordinates. Latitude must be in [-90, 90] and Longitude in [-180, 180].'
    );
  }
  return { lat, lon };
}

function assertWorkspaceExists(workspaceId: string) {
  if (workspaceId === '*') return;
  const ws = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!ws) {
    throw new ApiError(400, 'INVALID_WORKSPACE', `Workspace '${workspaceId}' does not exist.`);
  }
}

export const v1Router = Router();

v1Router.use(v1AuthAndRateLimit);

v1Router.get('/health', (req: RequestWithContext, res) => {
  res.json({
    status: 'ok',
    platform: 'CLIMATO',
    engine: 'CLIMATO-Geospatial-Core/2.0',
    requestId: req.requestId,
    dataMode: 'SAMPLE_DEMONSTRATION_WITH_STAGED_CONNECTORS',
    timestamp: new Date().toISOString(),
  });
});

// Audit Ledger Inspection (Bearer authenticated + scope-gated)
v1Router.get(
  '/audit-logs',
  requireScope('audit:read'),
  asyncHandler((req, res) => {
    const tenantWs = req.apiKeyContext?.workspaceId;
    const logs =
      tenantWs && tenantWs !== '*'
        ? db
            .prepare(
              `SELECT id, request_id, actor, action, resource_type, resource_id, metadata, created_at
               FROM audit_logs
               WHERE actor = ? OR metadata LIKE ?
               ORDER BY created_at DESC LIMIT 50`
            )
            .all(req.apiKeyContext!.id, `%"workspaceId":"${tenantWs}"%`)
        : db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 50').all();
    res.json({ count: logs.length, logs });
  })
);

// Sandbox API Key Management (hashed at rest; masked listing; admin-gated)
v1Router.get('/keys', requireKeyManagementAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, label, token_prefix, workspace_id, environment, scopes, rate_limit_rpm, last_used_at, created_at
       FROM api_keys
       WHERE revoked_at IS NULL
       ORDER BY created_at DESC`
    )
    .all() as Array<{
    id: string;
    label: string;
    token_prefix: string | null;
    workspace_id: string;
    environment: string;
    scopes: string;
    rate_limit_rpm: number;
    last_used_at: string | null;
    created_at: string;
  }>;

  const keys = rows.map((row) => ({
    id: row.id,
    label: row.label,
    workspace_id: row.workspace_id,
    token_masked: row.token_prefix || '****',
    token_value: row.token_prefix || '****',
    environment: row.environment,
    scopes: row.scopes,
    rate_limit_rpm: row.rate_limit_rpm,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
  }));

  res.json({
    keys,
    adminSecretConfigured: Boolean(process.env.CLIMATO_ADMIN_SECRET?.trim()),
  });
});

v1Router.post(
  '/keys',
  requireKeyManagementAuth,
  asyncHandler((req, res) => {
    const {
      label,
      workspaceId = 'ws-delta-agro',
      scopes = 'modules:read,reports:write,alerts:write,connectors:read,geospatial:analyze',
      rateLimitRpm = 120,
    } = req.body ?? {};
    if (!label || !String(label).trim()) {
      throw new ApiError(400, 'MISSING_KEY_LABEL', 'Key label is required.');
    }

    const cleanWorkspaceId = String(workspaceId).trim() || 'ws-delta-agro';
    assertWorkspaceExists(cleanWorkspaceId);

    const parsedRpm = Number(rateLimitRpm);
    const cleanRpm = Number.isFinite(parsedRpm) && parsedRpm >= 1 && parsedRpm <= 10_000 ? Math.floor(parsedRpm) : 120;

    const id = `key-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const randomPart = crypto.randomBytes(16).toString('hex');
    const rawToken = `clm_sbx_${randomPart}`;
    const tokenHash = hashApiToken(rawToken);
    const tokenPrefix = maskApiToken(rawToken);
    const now = new Date().toISOString();
    const cleanScopes = Array.isArray(scopes) ? scopes.join(',') : String(scopes);

    db.prepare(`
      INSERT INTO api_keys (
        id, label, token_value, token_hash, token_prefix, workspace_id,
        environment, scopes, rate_limit_rpm, last_used_at, revoked_at, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, 'sandbox', ?, ?, NULL, NULL, ?)
    `).run(
      id,
      String(label).trim(),
      tokenPrefix,
      tokenHash,
      tokenPrefix,
      cleanWorkspaceId,
      cleanScopes,
      cleanRpm,
      now
    );

    recordAuditLog({
      requestId: req.requestId || 'unknown',
      actor: 'api-portal',
      action: 'API_KEY_CREATED',
      resourceType: 'api_key',
      resourceId: id,
      metadata: { label: String(label).trim(), workspaceId: cleanWorkspaceId },
    });

    res.status(201).json({
      key: {
        id,
        label: String(label).trim(),
        workspace_id: cleanWorkspaceId,
        token_value: rawToken,
        token_masked: tokenPrefix,
        environment: 'sandbox',
        scopes: cleanScopes,
        rate_limit_rpm: cleanRpm,
        last_used_at: null,
        created_at: now,
      },
      notice:
        'Store this token now; only its SHA-256 digest is stored on the server and subsequent GET /api/v1/keys responses return masked prefixes only.',
    });
  })
);

v1Router.delete(
  '/keys/:id',
  requireKeyManagementAuth,
  asyncHandler((req, res) => {
    const id = String(req.params.id);
    if (id === 'key-sbx-default') {
      throw new ApiError(400, 'DEFAULT_SANDBOX_KEY_PROTECTED', 'The default evaluation sandbox key cannot be deleted.');
    }
    const existing = db
      .prepare('SELECT id, revoked_at FROM api_keys WHERE id = ?')
      .get(id) as { id: string; revoked_at: string | null } | undefined;
    if (!existing || existing.revoked_at !== null) {
      throw new ApiError(404, 'API_KEY_NOT_FOUND', 'API key not found or already revoked.');
    }

    const revokedAt = new Date().toISOString();
    db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ?').run(revokedAt, id);

    recordAuditLog({
      requestId: req.requestId || 'unknown',
      actor: 'api-portal',
      action: 'API_KEY_REVOKED',
      resourceType: 'api_key',
      resourceId: id,
    });
    res.json({ deleted: true, revokedAt, id });
  })
);

// Coordinate Staged Satellite Preview
v1Router.get(
  '/climate/summary',
  requireScope('connectors:read'),
  asyncHandler((req, res) => {
    const { lat, lon } = assertValidCoordinates(req.query.lat ?? 31.404, req.query.lon ?? 30.416);
    const connector = String(req.query.connector ?? 'sentinel-6');
    const preview = executeStagedPreview(connector, lat, lon);
    if (!preview) {
      throw new ApiError(404, 'CONNECTOR_NOT_FOUND', `Unknown staged satellite connector '${connector}'.`);
    }
    res.json(preview);
  })
);

// Multi-Hazard Coordinate Risk Profile Analyzer (Haversine + Egypt Corridor Classification)
v1Router.post(
  '/climate/analyze',
  requireScope('geospatial:analyze'),
  asyncHandler((req, res) => {
    const { lat, lon } = assertValidCoordinates(req.body?.lat ?? 31.404, req.body?.lon ?? 30.416);
    const profile = computeCoordinateRiskProfile(lat, lon);

    recordAuditLog({
      requestId: req.requestId || 'unknown',
      actor: req.apiKeyContext?.id || 'api-user',
      action: 'COORDINATE_RISK_ANALYZED',
      resourceType: 'coordinate',
      resourceId: `${lat.toFixed(4)},${lon.toFixed(4)}`,
      metadata: {
        workspaceId: req.apiKeyContext?.workspaceId,
        compositeRiskScore: profile.compositeRiskScore,
        riskTier: profile.riskTier,
      },
    });

    res.json({
      requestId: req.requestId,
      ...profile,
    });
  })
);

// Seven Climate Modules Data Endpoint (Tenant-Isolated)
v1Router.get(
  '/modules/:moduleId/data',
  requireScope('modules:read'),
  asyncHandler((req, res) => {
    const moduleId = String(req.params.moduleId);
    if (!VALID_MODULES.has(moduleId)) {
      throw new ApiError(
        404,
        'UNKNOWN_MODULE',
        `Module '${moduleId}' does not exist. Valid modules: ${Array.from(VALID_MODULES).join(', ')}`
      );
    }

    const tenantWs = resolveTenantWorkspaceId(req, req.query.workspaceId);
    const { aoiId, period } = req.query;

    if (typeof aoiId === 'string' && aoiId.trim() && aoiId !== 'all') {
      const aoiRow = db
        .prepare('SELECT id, workspace_id FROM aoi_locations WHERE id = ?')
        .get(aoiId.trim()) as { id: string; workspace_id: string } | undefined;
      if (aoiRow) {
        assertTenantRecordOwnership(req, aoiRow.workspace_id, `AOI '${aoiRow.id}'`);
      }
    }

    let query =
      'SELECT o.*, a.name_en as aoi_name_en, a.name_ar as aoi_name_ar, a.lat, a.lon, a.radius_km, a.workspace_id FROM sample_observations o JOIN aoi_locations a ON o.aoi_id = a.id WHERE o.module_id = ?';
    const params: string[] = [moduleId];

    if (tenantWs !== '*') {
      query += ' AND a.workspace_id = ?';
      params.push(tenantWs);
    }

    if (typeof aoiId === 'string' && aoiId.trim() && aoiId !== 'all') {
      query += ' AND o.aoi_id = ?';
      params.push(aoiId.trim());
    }
    if (typeof period === 'string' && period.trim() && period !== 'all') {
      query += ' AND o.period_label = ?';
      params.push(period.trim());
    }
    query += ' ORDER BY o.id ASC';

    const records = db.prepare(query).all(...params);
    res.json({
      requestId: req.requestId,
      workspaceId: tenantWs,
      moduleId,
      isSampleData: true,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      notice: 'Sandbox demonstration dataset. Connect staged satellite ingestion workers for live verified telemetry.',
      count: records.length,
      records,
    });
  })
);

// Staged Satellite Connector Registry
v1Router.get('/connectors', requireScope('connectors:read'), (_req, res) => {
  const connectors = listSatelliteConnectors();
  res.json({
    dataProvenance: 'STAGED_CONNECTOR_REGISTRY',
    count: connectors.length,
    connectors,
  });
});

// Workspaces & AOI Endpoints (Tenant-Isolated)
v1Router.get(
  '/workspaces',
  requireScope('modules:read'),
  asyncHandler((req, res) => {
    const tenantWs = resolveTenantWorkspaceId(req, req.query.workspaceId);
    const workspaces =
      tenantWs === '*'
        ? db.prepare('SELECT * FROM workspaces ORDER BY created_at ASC').all()
        : db.prepare('SELECT * FROM workspaces WHERE id = ? ORDER BY created_at ASC').all(tenantWs);
    const aois =
      tenantWs === '*'
        ? db.prepare('SELECT * FROM aoi_locations ORDER BY id ASC').all()
        : db.prepare('SELECT * FROM aoi_locations WHERE workspace_id = ? ORDER BY id ASC').all(tenantWs);

    res.json({
      workspaceId: tenantWs,
      isSampleData: true,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      workspaces,
      aois,
    });
  })
);

v1Router.post(
  '/aois',
  requireScope('modules:read'),
  asyncHandler((req, res) => {
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
    assertWorkspaceExists(workspaceId);

    if (!nameEn || !String(nameEn).trim()) {
      throw new ApiError(400, 'MISSING_AOI_NAME', 'AOI nameEn is required.');
    }
    const coords = assertValidCoordinates(lat, lon);
    if (!VALID_MODULES.has(String(primaryModule))) {
      throw new ApiError(400, 'INVALID_MODULE', 'primaryModule must be a valid CLIMATO module ID.');
    }

    const id = `aoi-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    db.prepare(`
      INSERT INTO aoi_locations (id, workspace_id, name_en, name_ar, lat, lon, radius_km, region_code, primary_module)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      workspaceId,
      String(nameEn).trim(),
      String(nameAr || nameEn).trim(),
      coords.lat,
      coords.lon,
      Number(radiusKm) || 18,
      String(regionCode),
      String(primaryModule)
    );

    recordAuditLog({
      requestId: req.requestId || 'unknown',
      actor: req.apiKeyContext?.id || 'api-user',
      action: 'AOI_CREATED',
      resourceType: 'aoi_location',
      resourceId: id,
      metadata: { workspaceId, lat: coords.lat, lon: coords.lon },
    });

    const created = db.prepare('SELECT * FROM aoi_locations WHERE id = ?').get(id);
    res.status(201).json({ isSampleData: true, dataProvenance: 'SAMPLE_DEMONSTRATION', aoi: created });
  })
);

// Climate & ESG Report Endpoints (Tenant-Isolated)
v1Router.get(
  '/reports',
  requireScope('modules:read'),
  asyncHandler((req, res) => {
    const tenantWs = resolveTenantWorkspaceId(req, req.query.workspaceId);
    const reports =
      tenantWs === '*'
        ? db.prepare('SELECT * FROM report_requests ORDER BY created_at DESC').all()
        : db.prepare('SELECT * FROM report_requests WHERE workspace_id = ? ORDER BY created_at DESC').all(tenantWs);
    res.json({ workspaceId: tenantWs, isSampleData: true, dataProvenance: 'SAMPLE_DEMONSTRATION', reports });
  })
);

v1Router.post(
  '/reports',
  requireScope('reports:write'),
  asyncHandler((req, res) => {
    const {
      workspaceId: requestedWorkspaceId,
      organizationName,
      sector,
      standard,
      moduleIds,
      lat = 30.044,
      lon = 31.235,
      reportType = 'Standard Sandbox Export',
    } = req.body ?? {};

    const workspaceId = resolveTenantWorkspaceId(req, requestedWorkspaceId);
    assertWorkspaceExists(workspaceId);

    if (!organizationName || !sector || !standard || !Array.isArray(moduleIds) || moduleIds.length === 0) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'organizationName, sector, standard, and moduleIds (non-empty array) are required.'
      );
    }

    const coords = assertValidCoordinates(lat, lon);
    const id = `rep-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
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
      coords.lat,
      coords.lon,
      String(reportType),
      status,
      now
    );

    recordAuditLog({
      requestId: req.requestId || 'unknown',
      actor: req.apiKeyContext?.id || 'api-user',
      action: 'REPORT_GENERATED',
      resourceType: 'report',
      resourceId: id,
      metadata: { workspaceId, standard, organizationName },
    });

    const created = db.prepare('SELECT * FROM report_requests WHERE id = ?').get(id);
    res.status(201).json({
      isSampleData: true,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      exportUrls: {
        json: `/api/v1/reports/${id}/export?format=json`,
        csv: `/api/v1/reports/${id}/export?format=csv`,
      },
      report: created,
    });
  })
);

v1Router.get(
  '/reports/:id/export',
  requireScope('modules:read'),
  asyncHandler((req, res) => {
    const id = String(req.params.id);
    const format = String(req.query.format || 'json').toLowerCase();
    const report = db.prepare('SELECT * FROM report_requests WHERE id = ?').get(id) as
      | (Record<string, unknown> & { workspace_id: string })
      | undefined;
    if (!report) {
      throw new ApiError(404, 'REPORT_NOT_FOUND', `Report '${id}' not found.`);
    }

    assertTenantRecordOwnership(req, report.workspace_id, `report '${id}'`);

    const observations = db
      .prepare(
        `SELECT o.* FROM sample_observations o
         JOIN aoi_locations a ON o.aoi_id = a.id
         WHERE a.workspace_id = ?
         LIMIT 16`
      )
      .all(report.workspace_id) as Array<Record<string, unknown>>;

    if (format === 'csv') {
      const headers = [
        'report_id',
        'workspace_id',
        'organization',
        'standard',
        'data_provenance',
        'aoi_id',
        'module_id',
        'source_name',
        'period_label',
        'metric_key',
        'metric_value',
        'unit',
      ];
      const lines = [headers.join(',')];
      for (const obs of observations) {
        lines.push(
          [
            report.id,
            report.workspace_id,
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

    res.json({
      disclaimer:
        'SAMPLE DEMONSTRATION REPORT — Generated from platform sandbox records. Connect verified satellite workers for audited production disclosures.',
      report,
      sampleObservationsIncluded: observations,
      exportedAt: new Date().toISOString(),
    });
  })
);

// Coordinate Trend Alerts & Real Geofence Evaluation Endpoints (Tenant-Isolated)
v1Router.get(
  '/alerts',
  requireScope('modules:read'),
  asyncHandler((req, res) => {
    const tenantWs = resolveTenantWorkspaceId(req, req.query.workspaceId);
    const { moduleId } = req.query;
    let query = 'SELECT * FROM trend_alerts WHERE 1=1';
    const params: string[] = [];
    if (tenantWs !== '*') {
      query += ' AND workspace_id = ?';
      params.push(tenantWs);
    }
    if (typeof moduleId === 'string' && moduleId !== 'all') {
      query += ' AND module_id = ?';
      params.push(moduleId);
    }
    query += ' ORDER BY created_at DESC';
    const alerts = db.prepare(query).all(...params);
    res.json({ workspaceId: tenantWs, isSampleData: true, dataProvenance: 'SAMPLE_DEMONSTRATION', alerts });
  })
);

v1Router.post(
  '/alerts',
  requireScope('alerts:write'),
  asyncHandler((req, res) => {
    const {
      workspaceId: requestedWorkspaceId,
      titleEn,
      titleAr,
      moduleId,
      lat,
      lon,
      radiusKm = 15,
      metricKey = 'anomaly_index',
      operator = '>',
      thresholdValue,
      unit = 'idx',
      severity = 'Elevated',
      channel = 'Webhook + Email',
    } = req.body ?? {};

    const workspaceId = resolveTenantWorkspaceId(req, requestedWorkspaceId);
    assertWorkspaceExists(workspaceId);

    if (!titleEn || !moduleId || typeof thresholdValue !== 'number' || !Number.isFinite(thresholdValue)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Missing required alert parameters (titleEn, moduleId, lat, lon, thresholdValue).'
      );
    }
    if (!VALID_MODULES.has(String(moduleId))) {
      throw new ApiError(400, 'INVALID_MODULE', 'moduleId must be a valid CLIMATO module ID.');
    }
    if (!VALID_ALERT_OPERATORS.has(String(operator))) {
      throw new ApiError(400, 'INVALID_OPERATOR', 'operator must be one of >, >=, <, <=.');
    }

    const coords = assertValidCoordinates(lat, lon);
    const id = `alt-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
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
      coords.lat,
      coords.lon,
      Number(radiusKm) || 15,
      String(metricKey),
      String(operator),
      thresholdValue,
      String(unit),
      String(severity),
      String(channel),
      now,
      now
    );

    recordAuditLog({
      requestId: req.requestId || 'unknown',
      actor: req.apiKeyContext?.id || 'api-user',
      action: 'ALERT_CREATED',
      resourceType: 'trend_alert',
      resourceId: id,
      metadata: { workspaceId, moduleId, thresholdValue },
    });

    const created = db.prepare('SELECT * FROM trend_alerts WHERE id = ?').get(id);
    res.status(201).json({ isSampleData: true, dataProvenance: 'SAMPLE_DEMONSTRATION', alert: created });
  })
);

v1Router.post(
  '/alerts/:id/evaluate',
  requireScope('alerts:write'),
  asyncHandler((req, res) => {
    const id = String(req.params.id);
    const existing = db
      .prepare('SELECT id, workspace_id FROM trend_alerts WHERE id = ?')
      .get(id) as { id: string; workspace_id: string } | undefined;
    if (!existing) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', `Alert rule '${id}' not found.`);
    }
    assertTenantRecordOwnership(req, existing.workspace_id, `alert '${id}'`);

    const evaluations = evaluateGeofenceAlerts(id, req.requestId || 'v1-eval');
    res.json({
      requestId: req.requestId,
      isSampleData: true,
      dataProvenance: 'SAMPLE_DEMONSTRATION',
      evaluation: evaluations[0],
    });
  })
);

v1Router.get(
  '/alerts/:id/evaluations',
  requireScope('modules:read'),
  asyncHandler((req, res) => {
    const id = String(req.params.id);
    const existing = db
      .prepare('SELECT id, workspace_id FROM trend_alerts WHERE id = ?')
      .get(id) as { id: string; workspace_id: string } | undefined;
    if (!existing) {
      throw new ApiError(404, 'ALERT_NOT_FOUND', `Alert rule '${id}' not found.`);
    }
    assertTenantRecordOwnership(req, existing.workspace_id, `alert '${id}'`);

    const rows = db
      .prepare('SELECT * FROM alert_evaluations WHERE alert_id = ? ORDER BY evaluated_at DESC LIMIT 20')
      .all(id);
    res.json({ isSampleData: true, dataProvenance: 'SAMPLE_DEMONSTRATION', evaluations: rows });
  })
);
