import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db/database.ts';
import { hashApiToken } from '../db/migrations.ts';

export type UserRole = 'platform_admin' | 'org_admin' | 'workspace_member' | 'authenticated_user';

export interface UserContext {
  userId: string;
  email: string;
  fullName: string;
  role: UserRole;
  organizationId: string;
  workspaceIds: string[];
  sessionId: string;
}

export interface ApiKeyContext {
  id: string;
  label: string;
  workspaceId: string;
  organizationId: string;
  scopes: string[];
  rateLimitRpm: number;
  expiresAt: string | null;
}

export interface RequestWithContext extends Request {
  requestId?: string;
  requestStartMs?: number;
  apiKeyContext?: ApiKeyContext;
  userContext?: UserContext;
  adminSecretAuthenticated?: boolean;
  authFailure?: { status: number; code: string; message: string };
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function parsePagination(
  query: Request['query'],
  defaults: { limit?: number; maxLimit?: number } = {}
): { limit: number; offset: number } {
  const defaultLimit = defaults.limit ?? 25;
  const maxLimit = defaults.maxLimit ?? 100;
  const rawLimit = Number(query.limit ?? defaultLimit);
  const rawOffset = Number(query.offset ?? 0);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(maxLimit, Math.max(1, Math.floor(rawLimit)))
    : defaultLimit;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
  return { limit, offset };
}

function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return null;
}

export function attachRequestContext(req: RequestWithContext, res: Response, next: NextFunction) {
  const reqId = `req_${crypto.randomBytes(6).toString('hex')}`;
  req.requestId = reqId;
  req.requestStartMs = Date.now();
  res.setHeader('X-Request-Id', reqId);
  res.setHeader('X-Climato-Engine', 'CLIMATO-Geospatial-Core/2.0');

  res.on('finish', () => {
    if (!req.path.startsWith('/api')) return;
    if (req.path === '/api/health' || req.path === '/api/v1/health') return;
    try {
      const actorType = req.apiKeyContext
        ? 'api_key'
        : req.userContext
        ? 'user_session'
        : req.adminSecretAuthenticated
        ? 'platform_admin_secret'
        : 'anonymous';
      const actorId =
        req.apiKeyContext?.id ||
        req.userContext?.userId ||
        (req.adminSecretAuthenticated ? 'platform-admin-secret' : req.ip || 'anonymous');
      const orgId =
        req.apiKeyContext?.organizationId || req.userContext?.organizationId || null;
      const wsId =
        req.apiKeyContext?.workspaceId || req.userContext?.workspaceIds[0] || null;
      const latency = req.requestStartMs ? Math.max(0, Date.now() - req.requestStartMs) : 0;

      db.prepare(`
        INSERT INTO api_usage_logs (
          id, request_id, actor_type, actor_id, organization_id, workspace_id,
          method, path, status_code, latency_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `usg-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
        reqId,
        actorType,
        actorId,
        orgId,
        wsId,
        req.method,
        req.originalUrl.split('?')[0].slice(0, 180),
        res.statusCode,
        latency,
        new Date().toISOString()
      );
    } catch {
      // Never throw inside response telemetry hook
    }
  });

  next();
}

export function asyncHandler(
  fn: (req: RequestWithContext, res: Response, next: NextFunction) => Promise<unknown> | unknown
) {
  return (req: RequestWithContext, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export const globalApiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: () => (process.env.NODE_ENV === 'test' ? 1000 : 180),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const r = req as RequestWithContext;
    res.status(429).json({
      error: {
        code: 'GLOBAL_RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP address. Please retry shortly.',
        requestId: r.requestId,
      },
    });
  },
});

export const authBruteForceRateLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: () => (process.env.NODE_ENV === 'test' ? 200 : 25),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const r = req as RequestWithContext;
    res.status(429).json({
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication or intake attempts. Please wait before retrying.',
        requestId: r.requestId,
      },
    });
  },
});

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function resetRateBucketsForTests() {
  rateBuckets.clear();
}

function resolveUserWorkspaceIds(userId: string, role: UserRole, orgId: string): string[] {
  if (role === 'platform_admin') return ['*'];
  if (role === 'org_admin') {
    const rows = db
      .prepare('SELECT id FROM workspaces WHERE organization_id = ?')
      .all(orgId) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }
  const memberRows = db
    .prepare(
      `SELECT wm.workspace_id
       FROM workspace_memberships wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = ? AND w.organization_id = ?`
    )
    .all(userId, orgId) as Array<{ workspace_id: string }>;
  return memberRows.map((r) => r.workspace_id);
}

function resolveSessionToken(rawToken: string): UserContext | null {
  const tokenHash = hashApiToken(rawToken);
  const row = db
    .prepare(
      `SELECT s.id as session_id, s.user_id, s.organization_id, s.expires_at, s.revoked_at,
              u.email, u.full_name, u.role, u.status as user_status
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        session_id: string;
        user_id: string;
        organization_id: string;
        expires_at: string;
        revoked_at: string | null;
        email: string;
        full_name: string;
        role: UserRole;
        user_status: string;
      }
    | undefined;

  if (!row || row.revoked_at !== null || row.user_status !== 'ACTIVE') {
    return null;
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    organizationId: row.organization_id,
    workspaceIds: resolveUserWorkspaceIds(row.user_id, row.role, row.organization_id),
    sessionId: row.session_id,
  };
}

function resolveApiKeyToken(rawToken: string): {
  context?: ApiKeyContext;
  error?: { status: number; code: string; message: string };
} {
  const tokenHash = hashApiToken(rawToken);
  const keyRow = db
    .prepare(
      `SELECT k.id, k.label, k.workspace_id, COALESCE(w.organization_id, k.organization_id) as organization_id,
              k.rate_limit_rpm, k.scopes, k.revoked_at, k.expires_at
       FROM api_keys k
       LEFT JOIN workspaces w ON w.id = k.workspace_id
       WHERE k.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        id: string;
        label: string;
        workspace_id: string;
        organization_id: string;
        rate_limit_rpm: number;
        scopes: string;
        revoked_at: string | null;
        expires_at: string | null;
      }
    | undefined;

  if (!keyRow || keyRow.revoked_at !== null) {
    return {
      error: {
        status: 401,
        code: 'INVALID_OR_REVOKED_API_KEY',
        message: 'The supplied API key is unrecognized or has been revoked.',
      },
    };
  }

  if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() <= Date.now()) {
    return {
      error: {
        status: 401,
        code: 'API_KEY_EXPIRED',
        message: 'The supplied API key has expired. Rotate or issue a new key.',
      },
    };
  }

  return {
    context: {
      id: keyRow.id,
      label: keyRow.label,
      workspaceId: keyRow.workspace_id || 'ws-delta-agro',
      organizationId: keyRow.organization_id || 'org-nile-agro',
      scopes: keyRow.scopes.split(',').map((s) => s.trim()).filter(Boolean),
      rateLimitRpm: keyRow.rate_limit_rpm || 60,
      expiresAt: keyRow.expires_at,
    },
  };
}

function checkOrganizationMonthlyQuota(organizationId: string): { allowed: boolean; used: number; quota: number } {
  const org = db
    .prepare('SELECT monthly_api_quota FROM organizations WHERE id = ?')
    .get(organizationId) as { monthly_api_quota: number } | undefined;
  const quota = org?.monthly_api_quota ?? 50_000;
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM api_usage_logs WHERE organization_id = ? AND created_at LIKE ?')
    .get(organizationId, `${monthPrefix}%`) as { cnt: number };
  return { allowed: row.cnt < quota, used: row.cnt, quota };
}

export function attachOptionalAuth(req: RequestWithContext, _res: Response, next: NextFunction) {
  const configuredAdminSecret = process.env.CLIMATO_ADMIN_SECRET?.trim();
  const providedAdminHeader = String(req.headers['x-climato-admin-secret'] || '').trim();
  if (configuredAdminSecret && providedAdminHeader && constantTimeEqual(providedAdminHeader, configuredAdminSecret)) {
    req.adminSecretAuthenticated = true;
  }

  const authHeader = req.headers.authorization;
  const sessionHeader = typeof req.headers['x-climato-session'] === 'string' ? req.headers['x-climato-session'].trim() : '';
  const cookieToken = parseCookieValue(req.headers.cookie, 'climato_session');

  let bearerToken: string | null = null;
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1].trim()) {
      req.authFailure = {
        status: 401,
        code: 'INVALID_AUTH_HEADER',
        message: 'Authorization header must follow "Bearer <TOKEN>" format.',
      };
      next();
      return;
    }
    bearerToken = match[1].trim();
  }

  const candidateSessionToken =
    (bearerToken && bearerToken.startsWith('clm_ses_') ? bearerToken : null) ||
    sessionHeader ||
    cookieToken;

  if (candidateSessionToken) {
    const userCtx = resolveSessionToken(candidateSessionToken);
    if (userCtx) {
      req.userContext = userCtx;
    } else if (bearerToken && bearerToken.startsWith('clm_ses_')) {
      req.authFailure = {
        status: 401,
        code: 'INVALID_OR_EXPIRED_SESSION',
        message: 'Session token is invalid, expired, or revoked.',
      };
    }
  }

  if (!req.userContext && bearerToken && !bearerToken.startsWith('clm_ses_')) {
    const resolvedKey = resolveApiKeyToken(bearerToken);
    if (resolvedKey.context) {
      req.apiKeyContext = resolvedKey.context;
    } else if (resolvedKey.error) {
      req.authFailure = resolvedKey.error;
    }
  }

  next();
}

export function requireAuthenticated(req: RequestWithContext, _res: Response, next: NextFunction) {
  if (req.authFailure) {
    next(new ApiError(req.authFailure.status, req.authFailure.code, req.authFailure.message));
    return;
  }
  if (!req.userContext && !req.apiKeyContext && !req.adminSecretAuthenticated) {
    next(
      new ApiError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required. Provide a valid user session or Bearer API token.'
      )
    );
    return;
  }
  next();
}

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: RequestWithContext, _res: Response, next: NextFunction) => {
    if (req.authFailure) {
      next(new ApiError(req.authFailure.status, req.authFailure.code, req.authFailure.message));
      return;
    }
    if (req.adminSecretAuthenticated) {
      next();
      return;
    }
    if (req.userContext) {
      if (req.userContext.role === 'platform_admin' || allowedRoles.includes(req.userContext.role)) {
        next();
        return;
      }
      next(
        new ApiError(
          403,
          'INSUFFICIENT_ROLE',
          `Role '${req.userContext.role}' is not permitted for this operation.`
        )
      );
      return;
    }
    if (req.apiKeyContext) {
      if (allowedRoles.includes('workspace_member') || allowedRoles.includes('authenticated_user')) {
        next();
        return;
      }
      next(
        new ApiError(
          403,
          'ADMIN_ROLE_REQUIRED',
          'This operation requires an organization or platform administrator session.'
        )
      );
      return;
    }
    next(
      new ApiError(
        401,
        'AUTHENTICATION_REQUIRED',
        'Authentication is required to access this resource.'
      )
    );
  };
}

export function requireKeyManagementAuth(req: RequestWithContext, _res: Response, next: NextFunction) {
  const configuredSecret = process.env.CLIMATO_ADMIN_SECRET?.trim();
  const isProd = process.env.NODE_ENV === 'production';
  const provided = String(req.headers['x-climato-admin-secret'] || '').trim();

  if (configuredSecret && provided) {
    if (constantTimeEqual(provided, configuredSecret)) {
      req.adminSecretAuthenticated = true;
      next();
      return;
    }
    next(
      new ApiError(
        403,
        'ADMIN_SECRET_REQUIRED',
        'Key management and administrative endpoints require a valid X-Climato-Admin-Secret header.'
      )
    );
    return;
  }

  if (req.userContext && (req.userContext.role === 'platform_admin' || req.userContext.role === 'org_admin')) {
    next();
    return;
  }

  if (!configuredSecret && isProd) {
    next(
      new ApiError(
        403,
        'KEY_MANAGEMENT_LOCKED',
        'Set CLIMATO_ADMIN_SECRET on the server or authenticate as a platform administrator.'
      )
    );
    return;
  }

  next(
    new ApiError(
      403,
      'ADMIN_SECRET_REQUIRED',
      'Key management and administrative endpoints require a valid X-Climato-Admin-Secret header or administrator session.'
    )
  );
}

export function v1AuthAndRateLimit(req: RequestWithContext, res: Response, next: NextFunction) {
  if (req.path === '/health') {
    next();
    return;
  }

  if (req.path.startsWith('/keys')) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    next(
      new ApiError(
        401,
        'MISSING_AUTH_TOKEN',
        'Authorization header with "Bearer <API_KEY>" is required for /api/v1 endpoints.'
      )
    );
    return;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].trim()) {
    next(
      new ApiError(
        401,
        'INVALID_AUTH_HEADER',
        'Authorization header must follow "Bearer <API_KEY>" format.'
      )
    );
    return;
  }

  const resolved = resolveApiKeyToken(match[1].trim());
  if (resolved.error || !resolved.context) {
    const err = resolved.error!;
    next(new ApiError(err.status, err.code, err.message));
    return;
  }

  const ctx = resolved.context;
  req.apiKeyContext = ctx;

  // Enforce monthly organization quota
  const quotaCheck = checkOrganizationMonthlyQuota(ctx.organizationId);
  res.setHeader('X-Climato-Org-Quota-Limit', String(quotaCheck.quota));
  res.setHeader('X-Climato-Org-Quota-Remaining', String(Math.max(0, quotaCheck.quota - quotaCheck.used)));
  if (!quotaCheck.allowed) {
    next(
      new ApiError(
        429,
        'ORGANIZATION_QUOTA_EXCEEDED',
        `Monthly API quota (${quotaCheck.quota}) exceeded for organization '${ctx.organizationId}'.`
      )
    );
    return;
  }

  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), ctx.id);

  const nowMs = Date.now();
  const existing = rateBuckets.get(ctx.id);
  const bucket = existing && existing.resetAt > nowMs ? existing : { count: 0, resetAt: nowMs + 60_000 };
  bucket.count += 1;
  rateBuckets.set(ctx.id, bucket);

  const remaining = Math.max(0, ctx.rateLimitRpm - bucket.count);
  res.setHeader('X-RateLimit-Limit', String(ctx.rateLimitRpm));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
  res.setHeader('X-Climato-Data-Provenance', 'SAMPLE_DEMONSTRATION');
  res.setHeader('X-Climato-Workspace-Id', ctx.workspaceId);

  if (bucket.count > ctx.rateLimitRpm) {
    next(
      new ApiError(429, 'RATE_LIMIT_EXCEEDED', `Rate limit of ${ctx.rateLimitRpm} requests/minute exceeded.`, {
        retryAfterSeconds: Math.ceil((bucket.resetAt - nowMs) / 1000),
      })
    );
    return;
  }

  next();
}

export function requireScope(requiredScope: string) {
  return (req: RequestWithContext, _res: Response, next: NextFunction) => {
    const ctx = req.apiKeyContext;
    if (!ctx) {
      next(new ApiError(401, 'MISSING_AUTH_CONTEXT', 'Authenticated API key context is required.'));
      return;
    }
    if (ctx.scopes.includes('*') || ctx.scopes.includes(requiredScope)) {
      next();
      return;
    }
    next(
      new ApiError(
        403,
        'INSUFFICIENT_SCOPE',
        `API key lacks required scope '${requiredScope}'.`
      )
    );
  };
}

export function getAllowedWorkspaceIdsForRequest(req: RequestWithContext): string[] | '*' {
  if (req.adminSecretAuthenticated) return '*';
  if (req.apiKeyContext) {
    return req.apiKeyContext.workspaceId === '*' ? '*' : [req.apiKeyContext.workspaceId];
  }
  if (req.userContext) {
    if (req.userContext.role === 'platform_admin') return '*';
    if (req.userContext.role === 'org_admin') {
      const rows = db
        .prepare('SELECT id FROM workspaces WHERE organization_id = ?')
        .all(req.userContext.organizationId) as Array<{ id: string }>;
      return rows.map((r) => r.id);
    }
    return req.userContext.workspaceIds;
  }
  return [];
}

export function resolveTenantWorkspaceId(
  req: RequestWithContext,
  requestedWorkspaceId?: unknown
): string {
  const requested =
    typeof requestedWorkspaceId === 'string' && requestedWorkspaceId.trim()
      ? requestedWorkspaceId.trim()
      : undefined;

  if (req.adminSecretAuthenticated || req.userContext?.role === 'platform_admin') {
    if (requested) return requested;
    return '*';
  }

  if (req.apiKeyContext) {
    const tenantWs = req.apiKeyContext.workspaceId;
    if (requested && tenantWs !== '*' && requested !== tenantWs) {
      throw new ApiError(
        403,
        'TENANT_ISOLATION_VIOLATION',
        `API key is scoped to workspace '${tenantWs}' and cannot access workspace '${requested}'.`
      );
    }
    if (tenantWs === '*' && requested) return requested;
    return tenantWs;
  }

  if (req.userContext) {
    const allowed = getAllowedWorkspaceIdsForRequest(req);
    if (allowed === '*') return requested || '*';
    if (requested) {
      if (!allowed.includes(requested)) {
        throw new ApiError(
          403,
          'TENANT_ISOLATION_VIOLATION',
          `User does not have access to workspace '${requested}'.`
        );
      }
      return requested;
    }
    if (allowed.length === 0) {
      throw new ApiError(
        403,
        'NO_WORKSPACE_ASSIGNED',
        'No workspace membership is assigned to this user account.'
      );
    }
    return allowed[0];
  }

  throw new ApiError(401, 'MISSING_AUTH_CONTEXT', 'Authenticated workspace context is required.');
}

export function assertTenantRecordOwnership(
  req: RequestWithContext,
  recordWorkspaceId: string,
  resourceLabel: string
) {
  if (req.adminSecretAuthenticated || req.userContext?.role === 'platform_admin') {
    return;
  }
  if (req.apiKeyContext) {
    if (req.apiKeyContext.workspaceId !== '*' && recordWorkspaceId !== req.apiKeyContext.workspaceId) {
      throw new ApiError(
        403,
        'TENANT_ISOLATION_VIOLATION',
        `Access denied to ${resourceLabel} outside workspace '${req.apiKeyContext.workspaceId}'.`
      );
    }
    return;
  }
  if (req.userContext) {
    const allowed = getAllowedWorkspaceIdsForRequest(req);
    if (allowed === '*' || allowed.includes(recordWorkspaceId)) {
      return;
    }
    throw new ApiError(
      403,
      'TENANT_ISOLATION_VIOLATION',
      `Access denied to ${resourceLabel} outside authorized workspaces.`
    );
  }
  throw new ApiError(401, 'MISSING_AUTH_CONTEXT', 'Authenticated workspace context is required.');
}

export function assertOrganizationOwnership(
  req: RequestWithContext,
  organizationId: string,
  resourceLabel: string
) {
  if (req.adminSecretAuthenticated || req.userContext?.role === 'platform_admin') return;
  if (req.userContext && req.userContext.organizationId === organizationId) return;
  if (req.apiKeyContext && req.apiKeyContext.organizationId === organizationId) return;
  throw new ApiError(
    403,
    'TENANT_ISOLATION_VIOLATION',
    `Access denied to ${resourceLabel} outside organization scope.`
  );
}

export function errorMiddleware(
  err: unknown,
  req: RequestWithContext,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.requestId,
      },
    });
    return;
  }

  const isProd = process.env.NODE_ENV === 'production';
  const rawMessage = err instanceof Error ? err.message : 'Unexpected server error';
  const looksLikeSqlError = /SQLITE|constraint|syntax error|no such table|no such column/i.test(rawMessage);
  const safeMessage = isProd || looksLikeSqlError
    ? 'An unexpected internal error occurred while processing the request.'
    : rawMessage;

  console.error(`[${req.requestId || 'unknown'}] Unhandled API Error:`, err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: safeMessage,
      requestId: req.requestId,
    },
  });
}
