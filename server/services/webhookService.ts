import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { db, recordAuditLog } from '../db/database.ts';
import { hashApiToken, maskApiToken } from '../db/migrations.ts';

const EPHEMERAL_WEBHOOK_PROCESS_KEY = crypto.randomBytes(32);

function getSecretEncryptionKey(): Buffer {
  const material =
    process.env.CLIMATO_WEBHOOK_SECRET?.trim() ||
    process.env.CLIMATO_ADMIN_SECRET?.trim() ||
    process.env.CLIMATO_SESSION_KEY?.trim();
  if (!material) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CLIMATO_WEBHOOK_SECRET or CLIMATO_ADMIN_SECRET must be set in production.');
    }
    return EPHEMERAL_WEBHOOK_PROCESS_KEY;
  }
  return crypto.createHash('sha256').update(`climato-webhook-enc-v1:${material}`).digest();
}

export function encryptWebhookSecret(rawSecret: string): string {
  const key = getSecretEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(rawSecret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `encv1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptWebhookSecret(stored: string): string | null {
  if (!stored.startsWith('encv1:')) return null;
  const parts = stored.split(':');
  if (parts.length !== 4) return null;
  try {
    const [, ivHex, tagHex, dataHex] = parts;
    const key = getSecretEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

function isPrivateOrBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const norm = ip.toLowerCase();
    if (norm === '::1' || norm === '::') return true;
    if (norm.startsWith('fe80:') || norm.startsWith('fc') || norm.startsWith('fd')) return true;
    if (norm.startsWith('::ffff:')) {
      return isPrivateOrBlockedIp(norm.slice('::ffff:'.length));
    }
  }
  return false;
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Webhook URL must be a valid absolute URL.');
  }

  const allowHttp =
    process.env.NODE_ENV === 'test' || process.env.CLIMATO_ALLOW_HTTP_WEBHOOKS === 'true';
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    throw new Error('Webhook URL must use HTTPS (HTTP is only permitted in test/local dev opt-in).');
  }

  const allowLocalhost =
    process.env.NODE_ENV === 'test' || process.env.CLIMATO_ALLOW_LOCALHOST_WEBHOOKS === 'true';
  const hostname = parsed.hostname.toLowerCase();

  if (!allowLocalhost) {
    if (
      hostname === 'localhost' ||
      hostname === 'localhost.localdomain' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new Error('Webhook destination cannot target internal or localhost hostnames.');
    }
    if (net.isIP(hostname) && isPrivateOrBlockedIp(hostname)) {
      throw new Error('Webhook destination IP address falls inside a blocked private or link-local range.');
    }
    try {
      const resolved = await dns.lookup(hostname, { all: true });
      for (const addr of resolved) {
        if (isPrivateOrBlockedIp(addr.address)) {
          throw new Error('Webhook hostname resolves to a blocked private or metadata IP address.');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('blocked private')) {
        throw err;
      }
    }
  }

  return parsed;
}

export function getPlatformWebhookSecret(): string {
  const configured = process.env.CLIMATO_WEBHOOK_SECRET?.trim();
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('CLIMATO_WEBHOOK_SECRET must be set in production for HMAC webhook signing.');
  }
  return configured || EPHEMERAL_WEBHOOK_PROCESS_KEY.toString('hex');
}

export function buildSignedWebhookHeaders(params: {
  rawBody: string;
  secret: string;
  event: string;
  deliveryId: string;
  timestampSeconds?: number;
}): {
  timestamp: string;
  signatureHeader: string;
  replayProtectedHeader: string;
  headers: Record<string, string>;
} {
  const ts = String(params.timestampSeconds ?? Math.floor(Date.now() / 1000));
  const bodyDigest = crypto.createHmac('sha256', params.secret).update(params.rawBody).digest('hex');
  const signatureHeader = `sha256=${bodyDigest}`;
  const tsDigest = crypto
    .createHmac('sha256', params.secret)
    .update(`${ts}.${params.rawBody}`)
    .digest('hex');
  const replayProtectedHeader = `v2=${tsDigest}`;

  return {
    timestamp: ts,
    signatureHeader,
    replayProtectedHeader,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'CLIMATO-Webhook-Dispatcher/2.0',
      'X-Climato-Event': params.event,
      'X-Climato-Delivery-Id': params.deliveryId,
      'X-Climato-Timestamp': ts,
      'X-Climato-Signature': signatureHeader,
      'X-Climato-Signature-V2': replayProtectedHeader,
    },
  };
}

export interface WebhookEndpointRow {
  id: string;
  workspace_id: string;
  organization_id: string;
  name: string;
  url: string;
  secret_value: string;
  secret_prefix: string;
  events: string;
  enabled: number;
  timeout_ms: number;
  max_retries: number;
  created_at: string;
  rotated_at: string | null;
  updated_at: string;
}

export interface PublicWebhookEndpoint {
  id: string;
  workspace_id: string;
  organization_id: string;
  label: string;
  target_url: string;
  secret_prefix: string;
  enabled: number;
  created_at: string;
  rotated_at: string | null;
  updated_at: string;
}

export function createWebhookEndpoint(params: {
  workspaceId: string;
  label: string;
  targetUrl: string;
  requestId?: string;
  actor?: string;
}): { endpoint: PublicWebhookEndpoint; rawSecret: string } {
  const id = `whk-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`;
  const rawSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  void hashApiToken(rawSecret);
  const secretPrefix = maskApiToken(rawSecret);
  const secretEncrypted = encryptWebhookSecret(rawSecret);
  const now = new Date().toISOString();

  const wsRow = db
    .prepare('SELECT organization_id FROM workspaces WHERE id = ?')
    .get(params.workspaceId) as { organization_id?: string } | undefined;
  const organizationId = wsRow?.organization_id || 'org-nile-agro';

  db.prepare(`
    INSERT INTO webhook_endpoints (
      id, workspace_id, organization_id, name, url, secret_value, secret_prefix,
      events, enabled, timeout_ms, max_retries, created_at, rotated_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'climato.threshold.breached', 1, 5000, 3, ?, NULL, ?)
  `).run(
    id,
    params.workspaceId,
    organizationId,
    params.label.trim(),
    params.targetUrl.trim(),
    secretEncrypted,
    secretPrefix,
    now,
    now
  );

  recordAuditLog({
    requestId: params.requestId || 'webhook-create',
    actor: params.actor || 'workspace-admin',
    action: 'WEBHOOK_ENDPOINT_CREATED',
    resourceType: 'webhook_endpoint',
    resourceId: id,
    metadata: { workspaceId: params.workspaceId, organizationId, label: params.label.trim() },
  });

  return {
    endpoint: {
      id,
      workspace_id: params.workspaceId,
      organization_id: organizationId,
      label: params.label.trim(),
      target_url: params.targetUrl.trim(),
      secret_prefix: secretPrefix,
      enabled: 1,
      created_at: now,
      rotated_at: null,
      updated_at: now,
    },
    rawSecret,
  };
}

export function rotateWebhookEndpointSecret(params: {
  endpointId: string;
  requestId?: string;
  actor?: string;
}): { endpointId: string; secretPrefix: string; rawSecret: string; rotatedAt: string } {
  const rawSecret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
  const secretPrefix = maskApiToken(rawSecret);
  const secretEncrypted = encryptWebhookSecret(rawSecret);
  const rotatedAt = new Date().toISOString();

  db.prepare(`
    UPDATE webhook_endpoints
    SET secret_value = ?, secret_prefix = ?, rotated_at = ?, updated_at = ?
    WHERE id = ?
  `).run(secretEncrypted, secretPrefix, rotatedAt, rotatedAt, params.endpointId);

  recordAuditLog({
    requestId: params.requestId || 'webhook-rotate',
    actor: params.actor || 'workspace-admin',
    action: 'WEBHOOK_SECRET_ROTATED',
    resourceType: 'webhook_endpoint',
    resourceId: params.endpointId,
  });

  return {
    endpointId: params.endpointId,
    secretPrefix,
    rawSecret,
    rotatedAt,
  };
}

export interface DispatchDeliverySummary {
  deliveryId: string;
  endpointId: string | null;
  targetUrl: string;
  status: 'SENT' | 'FAILED';
  httpStatus: number | null;
  attemptCount: number;
  errorMessage: string | null;
  signatureHeader: string;
  timestampHeader: string;
}

export async function dispatchWebhookWithRetry(params: {
  workspaceId: string;
  alertId: string;
  evaluationId: string;
  endpointId?: string | null;
  targetUrl: string;
  signingSecret: string;
  payloadObject: Record<string, unknown>;
  event?: string;
  maxAttempts?: number;
  timeoutMs?: number;
  retryBackoffMs?: number[];
}): Promise<DispatchDeliverySummary> {
  const deliveryId = `dlv-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const maxAttempts = Math.max(1, Math.min(5, params.maxAttempts ?? 3));
  const timeoutMs = Math.max(500, Math.min(15000, params.timeoutMs ?? 4000));
  const backoff =
    params.retryBackoffMs ?? (process.env.NODE_ENV === 'test' ? [25, 50, 100] : [250, 750, 1500]);
  const eventName = params.event || 'climato.threshold.breached';
  const rawBody = JSON.stringify(params.payloadObject);
  const now = new Date().toISOString();

  const initialSign = buildSignedWebhookHeaders({
    rawBody,
    secret: params.signingSecret,
    event: eventName,
    deliveryId,
  });

  db.prepare(`
    INSERT INTO webhook_deliveries (
      id, endpoint_id, evaluation_id, alert_id, workspace_id, event_type,
      payload_json, signature_header, timestamp_header, status, attempt_count,
      http_status, error_message, next_retry_at, delivered_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, NULL, NULL, NULL, NULL, ?)
  `).run(
    deliveryId,
    params.endpointId ?? null,
    params.evaluationId,
    params.alertId,
    params.workspaceId,
    eventName,
    rawBody,
    initialSign.signatureHeader,
    initialSign.timestamp,
    now
  );

  // SSRF safety check prior to outbound call
  try {
    await assertSafeWebhookUrl(params.targetUrl);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Blocked webhook URL';
    db.prepare(`
      UPDATE webhook_deliveries
      SET status = 'FAILED', attempt_count = 1, error_message = ?, next_retry_at = NULL
      WHERE id = ?
    `).run(errMsg, deliveryId);
    return {
      deliveryId,
      endpointId: params.endpointId ?? null,
      targetUrl: params.targetUrl,
      status: 'FAILED',
      httpStatus: null,
      attemptCount: 1,
      errorMessage: errMsg,
      signatureHeader: initialSign.signatureHeader,
      timestampHeader: initialSign.timestamp,
    };
  }

  let lastHttpStatus: number | null = null;
  let lastError: string | null = null;
  let finalSig = initialSign;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    finalSig = buildSignedWebhookHeaders({
      rawBody,
      secret: params.signingSecret,
      event: eventName,
      deliveryId,
    });

    if (attempt > 1) {
      const waitMs = backoff[Math.min(attempt - 2, backoff.length - 1)] ?? 50;
      const nextRetryAt = new Date(Date.now() + waitMs).toISOString();
      db.prepare(
        `UPDATE webhook_deliveries SET status = 'RETRYING', attempt_count = ?, next_retry_at = ? WHERE id = ?`
      ).run(attempt - 1, nextRetryAt, deliveryId);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    try {
      const res = await fetch(params.targetUrl, {
        method: 'POST',
        headers: finalSig.headers,
        body: rawBody,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });

      lastHttpStatus = res.status;
      const bodyText = (await res.text()).slice(0, 240);

      if (res.status >= 200 && res.status < 300) {
        const deliveredAt = new Date().toISOString();
        db.prepare(`
          UPDATE webhook_deliveries
          SET status = 'SENT', attempt_count = ?, http_status = ?,
              error_message = NULL, signature_header = ?, timestamp_header = ?,
              next_retry_at = NULL, delivered_at = ?
          WHERE id = ?
        `).run(
          attempt,
          res.status,
          finalSig.signatureHeader,
          finalSig.timestamp,
          deliveredAt,
          deliveryId
        );

        return {
          deliveryId,
          endpointId: params.endpointId ?? null,
          targetUrl: params.targetUrl,
          status: 'SENT',
          httpStatus: res.status,
          attemptCount: attempt,
          errorMessage: null,
          signatureHeader: finalSig.signatureHeader,
          timestampHeader: finalSig.timestamp,
        };
      }

      lastError = `HTTP ${res.status}: ${bodyText || 'Non-2xx response'}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Network delivery error';
    }
  }

  db.prepare(`
    UPDATE webhook_deliveries
    SET status = 'FAILED', attempt_count = ?, http_status = ?, error_message = ?,
        signature_header = ?, timestamp_header = ?, next_retry_at = NULL
    WHERE id = ?
  `).run(
    maxAttempts,
    lastHttpStatus,
    lastError,
    finalSig.signatureHeader,
    finalSig.timestamp,
    deliveryId
  );

  return {
    deliveryId,
    endpointId: params.endpointId ?? null,
    targetUrl: params.targetUrl,
    status: 'FAILED',
    httpStatus: lastHttpStatus,
    attemptCount: maxAttempts,
    errorMessage: lastError,
    signatureHeader: finalSig.signatureHeader,
    timestampHeader: finalSig.timestamp,
  };
}

export async function dispatchWorkspaceAlertWebhooks(params: {
  workspaceId: string;
  alertId: string;
  evaluationId: string;
  payloadObject: Record<string, unknown>;
  explicitWebhookUrl?: string;
}): Promise<{
  overallStatus: 'SENT' | 'FAILED' | 'NO_WEBHOOK_ENDPOINT_CONFIGURED';
  deliveries: DispatchDeliverySummary[];
}> {
  const endpoints = db
    .prepare('SELECT * FROM webhook_endpoints WHERE workspace_id = ? AND enabled = 1 ORDER BY created_at ASC')
    .all(params.workspaceId) as unknown as WebhookEndpointRow[];

  const targets: Array<{ endpointId: string | null; targetUrl: string; signingSecret: string }> = [];
  for (const ep of endpoints) {
    const decrypted = ep.secret_value ? decryptWebhookSecret(ep.secret_value) : null;
    targets.push({
      endpointId: ep.id,
      targetUrl: ep.url,
      signingSecret: decrypted || getPlatformWebhookSecret(),
    });
  }

  if (params.explicitWebhookUrl?.trim()) {
    targets.push({
      endpointId: null,
      targetUrl: params.explicitWebhookUrl.trim(),
      signingSecret: getPlatformWebhookSecret(),
    });
  }

  if (targets.length === 0) {
    return {
      overallStatus: 'NO_WEBHOOK_ENDPOINT_CONFIGURED',
      deliveries: [],
    };
  }

  const deliveries: DispatchDeliverySummary[] = [];
  for (const target of targets) {
    const res = await dispatchWebhookWithRetry({
      workspaceId: params.workspaceId,
      alertId: params.alertId,
      evaluationId: params.evaluationId,
      endpointId: target.endpointId,
      targetUrl: target.targetUrl,
      signingSecret: target.signingSecret,
      payloadObject: params.payloadObject,
    });
    deliveries.push(res);
  }

  const anySent = deliveries.some((d) => d.status === 'SENT');
  const allSent = deliveries.every((d) => d.status === 'SENT');
  return {
    overallStatus: allSent || anySent ? 'SENT' : 'FAILED',
    deliveries,
  };
}
