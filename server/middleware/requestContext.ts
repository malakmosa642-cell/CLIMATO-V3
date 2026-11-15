import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/database.ts';
import { hashApiToken } from '../db/migrations.ts';

export interface RequestWithContext extends Request {
  requestId?: string;
  apiKeyContext?: {
    id: string;
    label: string;
    workspaceId: string;
    scopes: string[];
    rateLimitRpm: number;
  };
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
    // Perform dummy comparison to avoid leaking length via timing
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function attachRequestContext(req: RequestWithContext, res: Response, next: NextFunction) {
  const reqId = `req_${crypto.randomBytes(6).toString('hex')}`;
  req.requestId = reqId;
  res.setHeader('X-Request-Id', reqId);
  res.setHeader('X-Climato-Engine', 'CLIMATO-Geospatial-Core/2.0');
  next();
}

export function asyncHandler(
  fn: (req: RequestWithContext, res: Response, next: NextFunction) => Promise<unknown> | unknown
) {
  return (req: RequestWithContext, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function resetRateBucketsForTests() {
  rateBuckets.clear();
}

export function requireKeyManagementAuth(req: RequestWithContext, _res: Response, next: NextFunction) {
  const configuredSecret = process.env.CLIMATO_ADMIN_SECRET?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (configuredSecret) {
    const provided = String(req.headers['x-climato-admin-secret'] || '').trim();
    if (!provided || !constantTimeEqual(provided, configuredSecret)) {
      next(
        new ApiError(
          403,
          'ADMIN_SECRET_REQUIRED',
          'Key management and administrative endpoints require a valid X-Climato-Admin-Secret header.'
        )
      );
      return;
    }
  } else if (isProd) {
    next(
      new ApiError(
        403,
        'KEY_MANAGEMENT_LOCKED',
        'Set CLIMATO_ADMIN_SECRET on the server to enable administrative and API key management endpoints in production.'
      )
    );
    return;
  }

  next();
}

export function v1AuthAndRateLimit(req: RequestWithContext, res: Response, next: NextFunction) {
  // Public health check bypasses Bearer check
  if (req.path === '/health') {
    next();
    return;
  }

  // Key management uses dedicated admin protection
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

  const token = match[1].trim();
  const tokenHash = hashApiToken(token);

  const keyRow = db
    .prepare(
      'SELECT id, label, workspace_id, rate_limit_rpm, scopes, revoked_at FROM api_keys WHERE token_hash = ?'
    )
    .get(tokenHash) as
    | {
        id: string;
        label: string;
        workspace_id: string;
        rate_limit_rpm: number;
        scopes: string;
        revoked_at: string | null;
      }
    | undefined;

  if (!keyRow || keyRow.revoked_at !== null) {
    next(
      new ApiError(
        401,
        'INVALID_OR_REVOKED_API_KEY',
        'The supplied API key is unrecognized or has been revoked.'
      )
    );
    return;
  }

  const limitRpm = keyRow.rate_limit_rpm || 60;
  const bucketKey = keyRow.id;
  req.apiKeyContext = {
    id: keyRow.id,
    label: keyRow.label,
    workspaceId: keyRow.workspace_id || 'ws-delta-agro',
    scopes: keyRow.scopes.split(',').map((s) => s.trim()).filter(Boolean),
    rateLimitRpm: limitRpm,
  };

  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), keyRow.id);

  const nowMs = Date.now();
  const existing = rateBuckets.get(bucketKey);
  const bucket = existing && existing.resetAt > nowMs ? existing : { count: 0, resetAt: nowMs + 60_000 };
  bucket.count += 1;
  rateBuckets.set(bucketKey, bucket);

  const remaining = Math.max(0, limitRpm - bucket.count);
  res.setHeader('X-RateLimit-Limit', String(limitRpm));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
  res.setHeader('X-Climato-Data-Provenance', 'SAMPLE_DEMONSTRATION');
  res.setHeader('X-Climato-Workspace-Id', req.apiKeyContext.workspaceId);

  if (bucket.count > limitRpm) {
    next(
      new ApiError(429, 'RATE_LIMIT_EXCEEDED', `Rate limit of ${limitRpm} requests/minute exceeded.`, {
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

export function resolveTenantWorkspaceId(
  req: RequestWithContext,
  requestedWorkspaceId?: unknown
): string {
  const ctx = req.apiKeyContext;
  if (!ctx) {
    throw new ApiError(401, 'MISSING_AUTH_CONTEXT', 'Authenticated API key context is required.');
  }

  const tenantWs = ctx.workspaceId;
  const requested =
    typeof requestedWorkspaceId === 'string' && requestedWorkspaceId.trim()
      ? requestedWorkspaceId.trim()
      : undefined;

  if (requested && tenantWs !== '*' && requested !== tenantWs) {
    throw new ApiError(
      403,
      'TENANT_ISOLATION_VIOLATION',
      `API key is scoped to workspace '${tenantWs}' and cannot access workspace '${requested}'.`
    );
  }

  if (tenantWs === '*' && requested) {
    return requested;
  }

  return tenantWs;
}

export function assertTenantRecordOwnership(
  req: RequestWithContext,
  recordWorkspaceId: string,
  resourceLabel: string
) {
  const ctx = req.apiKeyContext;
  if (!ctx) {
    throw new ApiError(401, 'MISSING_AUTH_CONTEXT', 'Authenticated API key context is required.');
  }
  if (ctx.workspaceId !== '*' && recordWorkspaceId !== ctx.workspaceId) {
    throw new ApiError(
      403,
      'TENANT_ISOLATION_VIOLATION',
      `Access denied to ${resourceLabel} outside workspace '${ctx.workspaceId}'.`
    );
  }
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

  const message = err instanceof Error ? err.message : 'Unexpected server error';
  console.error(`[${req.requestId || 'unknown'}] Unhandled API Error:`, err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
      requestId: req.requestId,
    },
  });
}
