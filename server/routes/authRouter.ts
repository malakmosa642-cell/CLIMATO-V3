import crypto from 'node:crypto';
import { Router } from 'express';
import {
  db,
  hashPassword,
  recordAuditLog,
  verifyPassword,
  withTransaction,
} from '../db/database.ts';
import { hashApiToken } from '../db/migrations.ts';
import {
  ApiError,
  RequestWithContext,
  assertOrganizationOwnership,
  asyncHandler,
  authBruteForceRateLimiter,
  parsePagination,
  requireAuthenticated,
  requireRoles,
} from '../middleware/requestContext.ts';

const VALID_ROLES = new Set(['org_admin', 'workspace_member', 'authenticated_user']);

function setSessionCookie(res: { setHeader: (name: string, val: string) => void }, token: string) {
  const secureAttr = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `climato_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureAttr}`
  );
}

function clearSessionCookie(res: { setHeader: (name: string, val: string) => void }) {
  res.setHeader('Set-Cookie', 'climato_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

export const authRouter = Router();

authRouter.post(
  '/register',
  authBruteForceRateLimiter,
  asyncHandler((req: RequestWithContext, res) => {
    const { email, fullName, password, organizationName, sector = 'Agriculture & Exporting' } = req.body ?? {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(fullName || '').trim();
    const cleanPassword = String(password || '');

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new ApiError(400, 'INVALID_EMAIL', 'A valid corporate email address is required.');
    }
    if (!cleanName || cleanName.length < 2) {
      throw new ApiError(400, 'INVALID_NAME', 'Full name is required.');
    }
    if (cleanPassword.length < 10) {
      throw new ApiError(
        400,
        'WEAK_PASSWORD',
        'Password must be at least 10 characters long.'
      );
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
    }

    const cleanOrgName =
      String(organizationName || '').trim() || `${cleanName.split(/\s+/)[0]} Climate Organization`;
    const slugBase = cleanOrgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'org';

    const orgId = `org-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const wsId = `ws-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
    const userId = `usr-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const sessionId = `ses-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const rawSessionToken = `clm_ses_${crypto.randomBytes(24).toString('hex')}`;
    const sessionHash = hashApiToken(rawSessionToken);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    withTransaction(() => {
      db.prepare(`
        INSERT INTO organizations (id, name, slug, plan_tier, monthly_api_quota, aoi_quota, billing_status, created_at)
        VALUES (?, ?, ?, 'Sector Pro', 50000, 25, 'SANDBOX_ACTIVE', ?)
      `).run(orgId, cleanOrgName, `${slugBase}-${crypto.randomBytes(2).toString('hex')}`, now);

      db.prepare(`
        INSERT INTO workspaces (id, name_en, name_ar, sector, plan_tier, aoi_limit, owner_role_en, owner_role_ar, active_modules, organization_id, created_at)
        VALUES (?, ?, ?, ?, 'Sector Pro Tier', 25, 'Organization Admin', 'مدير المؤسسة', 'delta-risk,crop-health,water-monitoring,esg-reporting,trend-alerts', ?, ?)
      `).run(wsId, `${cleanOrgName} Workspace`, `مساحة عمل ${cleanOrgName}`, String(sector), orgId, now);

      db.prepare(`
        INSERT INTO users (id, email, full_name, password_hash, role, organization_id, status, failed_login_attempts, created_at)
        VALUES (?, ?, ?, ?, 'org_admin', ?, 'ACTIVE', 0, ?)
      `).run(userId, cleanEmail, cleanName, hashPassword(cleanPassword), orgId, now);

      db.prepare(`
        INSERT INTO workspace_memberships (id, user_id, workspace_id, role, created_at)
        VALUES (?, ?, ?, 'org_admin', ?)
      `).run(`wm-${crypto.randomBytes(4).toString('hex')}`, userId, wsId, now);

      db.prepare(`
        INSERT INTO user_sessions (id, user_id, organization_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sessionId, userId, orgId, sessionHash, expiresAt, now);
    });

    recordAuditLog({
      requestId: req.requestId || 'auth-register',
      actor: userId,
      action: 'USER_ORG_REGISTERED',
      resourceType: 'organization',
      resourceId: orgId,
      metadata: { email: cleanEmail, workspaceId: wsId },
    });

    setSessionCookie(res, rawSessionToken);
    res.status(201).json({
      token: rawSessionToken,
      expiresAt,
      user: {
        id: userId,
        email: cleanEmail,
        fullName: cleanName,
        role: 'org_admin',
        organizationId: orgId,
        workspaceIds: [wsId],
      },
      organization: { id: orgId, name: cleanOrgName, planTier: 'Sector Pro' },
    });
  })
);

authRouter.post(
  '/login',
  authBruteForceRateLimiter,
  asyncHandler((req: RequestWithContext, res) => {
    const { email, password } = req.body ?? {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');

    if (!cleanEmail || !cleanPassword) {
      throw new ApiError(400, 'MISSING_CREDENTIALS', 'Email and password are required.');
    }

    const userRow = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(cleanEmail) as
      | {
          id: string;
          email: string;
          full_name: string;
          password_hash: string;
          role: string;
          organization_id: string;
          status: string;
          failed_login_attempts: number;
          locked_until: string | null;
        }
      | undefined;

    if (!userRow) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    if (userRow.status !== 'ACTIVE') {
      throw new ApiError(403, 'ACCOUNT_DISABLED', 'User account is suspended or inactive.');
    }

    if (userRow.locked_until && new Date(userRow.locked_until).getTime() > Date.now()) {
      throw new ApiError(
        429,
        'ACCOUNT_LOCKED',
        'Account temporarily locked due to repeated failed login attempts. Try again later.'
      );
    }

    const valid = verifyPassword(cleanPassword, userRow.password_hash);
    if (!valid) {
      const nextAttempts = (userRow.failed_login_attempts || 0) + 1;
      const lockedUntil =
        nextAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
      db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').run(
        nextAttempts,
        lockedUntil,
        userRow.id
      );
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const rawSessionToken = `clm_ses_${crypto.randomBytes(24).toString('hex')}`;
    const sessionHash = hashApiToken(rawSessionToken);
    const sessionId = `ses-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    withTransaction(() => {
      db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(
        userRow.id
      );
      db.prepare(`
        INSERT INTO user_sessions (id, user_id, organization_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sessionId, userRow.id, userRow.organization_id, sessionHash, expiresAt, now);
    });

    const org = db
      .prepare('SELECT id, name, slug, plan_tier, monthly_api_quota, aoi_quota, billing_status FROM organizations WHERE id = ?')
      .get(userRow.organization_id);

    recordAuditLog({
      requestId: req.requestId || 'auth-login',
      actor: userRow.id,
      action: 'USER_LOGGED_IN',
      resourceType: 'user',
      resourceId: userRow.id,
    });

    setSessionCookie(res, rawSessionToken);
    res.json({
      token: rawSessionToken,
      expiresAt,
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        role: userRow.role,
        organizationId: userRow.organization_id,
      },
      organization: org,
    });
  })
);

authRouter.post(
  '/logout',
  requireAuthenticated,
  asyncHandler((req: RequestWithContext, res) => {
    if (req.userContext?.sessionId) {
      db.prepare('UPDATE user_sessions SET revoked_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        req.userContext.sessionId
      );
    }
    clearSessionCookie(res);
    res.json({ loggedOut: true });
  })
);

authRouter.get('/me', (req: RequestWithContext, res) => {
  if (!req.userContext) {
    res.json({
      authenticated: false,
      user: null,
      organization: null,
    });
    return;
  }

  const org = db
    .prepare(
      'SELECT id, name, slug, plan_tier, monthly_api_quota, aoi_quota, billing_status FROM organizations WHERE id = ?'
    )
    .get(req.userContext.organizationId);

  const monthPrefix = new Date().toISOString().slice(0, 7);
  const usageRow = db
    .prepare('SELECT COUNT(*) as count FROM api_usage_logs WHERE organization_id = ? AND created_at LIKE ?')
    .get(req.userContext.organizationId, `${monthPrefix}%`) as { count: number };

  res.json({
    authenticated: true,
    user: req.userContext,
    organization: org,
    usageThisMonth: usageRow.count,
  });
});

// Organization & Team Member Management (RBAC: org_admin or platform_admin)
authRouter.get(
  '/org',
  requireAuthenticated,
  asyncHandler((req: RequestWithContext, res) => {
    const orgId = req.userContext?.organizationId || req.apiKeyContext?.organizationId;
    if (!orgId) {
      throw new ApiError(400, 'NO_ORGANIZATION_CONTEXT', 'No organization bound to current session.');
    }
    assertOrganizationOwnership(req, orgId, 'organization');

    const org = db.prepare('SELECT * FROM organizations WHERE id = ?').get(orgId);
    const { limit, offset } = parsePagination(req.query);
    const members = db
      .prepare(
        `SELECT id, email, full_name, role, status, created_at
         FROM users WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(orgId, limit, offset);
    const workspaces = db
      .prepare('SELECT * FROM workspaces WHERE organization_id = ? ORDER BY created_at ASC')
      .all(orgId);
    const monthPrefix = new Date().toISOString().slice(0, 7);
    const usage = db
      .prepare('SELECT COUNT(*) as requestsThisMonth FROM api_usage_logs WHERE organization_id = ? AND created_at LIKE ?')
      .get(orgId, `${monthPrefix}%`) as { requestsThisMonth: number };

    res.json({
      organization: org,
      workspaces,
      members,
      usage,
    });
  })
);

authRouter.post(
  '/org/members',
  requireRoles('org_admin', 'platform_admin'),
  asyncHandler((req: RequestWithContext, res) => {
    const orgId = req.userContext?.organizationId;
    if (!orgId) {
      throw new ApiError(403, 'USER_SESSION_REQUIRED', 'User session required to manage organization members.');
    }
    const { email, fullName, password, role = 'workspace_member', workspaceIds = [] } = req.body ?? {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(fullName || '').trim();
    const cleanPassword = String(password || '');
    const cleanRole = String(role || 'workspace_member');

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new ApiError(400, 'INVALID_EMAIL', 'Valid email is required.');
    }
    if (!cleanName || cleanPassword.length < 10) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'fullName and password (>= 10 chars) are required.');
    }
    if (!VALID_ROLES.has(cleanRole)) {
      throw new ApiError(400, 'INVALID_ROLE', 'Allowed member roles: org_admin, workspace_member, authenticated_user.');
    }

    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (exists) {
      throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'User email already registered.');
    }

    const orgWorkspaces = db
      .prepare('SELECT id FROM workspaces WHERE organization_id = ?')
      .all(orgId) as Array<{ id: string }>;
    const validWsSet = new Set(orgWorkspaces.map((w) => w.id));
    const targetWsIds = Array.isArray(workspaceIds) && workspaceIds.length > 0
      ? workspaceIds.map(String).filter((w) => validWsSet.has(w))
      : orgWorkspaces.slice(0, 1).map((w) => w.id);

    const newUserId = `usr-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    withTransaction(() => {
      db.prepare(`
        INSERT INTO users (id, email, full_name, password_hash, role, organization_id, status, failed_login_attempts, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?)
      `).run(newUserId, cleanEmail, cleanName, hashPassword(cleanPassword), cleanRole, orgId, now);

      const insMem = db.prepare(`
        INSERT OR IGNORE INTO workspace_memberships (id, user_id, workspace_id, role, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const wsId of targetWsIds) {
        insMem.run(`wm-${crypto.randomBytes(4).toString('hex')}`, newUserId, wsId, cleanRole, now);
      }
    });

    recordAuditLog({
      requestId: req.requestId || 'org-member-add',
      actor: req.userContext!.userId,
      action: 'ORG_MEMBER_ADDED',
      resourceType: 'user',
      resourceId: newUserId,
      metadata: { organizationId: orgId, role: cleanRole, workspaceIds: targetWsIds },
    });

    res.status(201).json({
      member: {
        id: newUserId,
        email: cleanEmail,
        fullName: cleanName,
        role: cleanRole,
        organizationId: orgId,
        workspaceIds: targetWsIds,
      },
    });
  })
);
