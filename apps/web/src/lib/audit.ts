import { createAuditLog } from '@aidepedia/db';
import type { NewAuditLog } from '@aidepedia/db';

/**
 * Log an admin action to the audit log
 */
export async function logAuditEntry(params: {
  userId?: number | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  request?: Request;
}): Promise<void> {
  try {
    const logData: NewAuditLog = {
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      details: params.details,
      ipAddress: params.request ? getClientIp(params.request) : null,
      userAgent: params.request ? params.request.headers.get('user-agent') : null,
    };

    await createAuditLog(logData);
  } catch (error) {
    // Don't throw - audit logging should not break the main operation
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Extract client IP from request
 */
function getClientIp(request: Request): string | null {
  // Check common headers for real IP (behind proxy)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Cloudflare specific
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp;
  }

  return null;
}

/**
 * Common audit actions
 */
export const AuditActions = {
  // User actions
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_BANNED: 'user.banned',
  USER_UNBANNED: 'user.unbanned',
  
  // Article moderation
  ARTICLE_APPROVED: 'article.approved',
  ARTICLE_REJECTED: 'article.rejected',
  ARTICLE_DELETED: 'article.deleted',
  
  // Settings
  SETTINGS_CHANGED: 'settings.changed',
  
  // Webhooks
  WEBHOOK_CREATED: 'webhook.created',
  WEBHOOK_UPDATED: 'webhook.updated',
  WEBHOOK_DELETED: 'webhook.deleted',
  
  // Rate limits
  RATE_LIMIT_CHANGED: 'rate_limit.changed',
  RATE_LIMIT_BLOCKED: 'rate_limit.blocked',
  RATE_LIMIT_UNBLOCKED: 'rate_limit.unblocked',

  // Feature flags
  FEATURE_FLAG_CREATED: 'feature_flag.created',
  FEATURE_FLAG_UPDATED: 'feature_flag.updated',
  FEATURE_FLAG_DELETED: 'feature_flag.deleted',
} as const;

/**
 * Resource types for audit logs
 */
export const ResourceTypes = {
  USER: 'user',
  ARTICLE: 'article',
  SETTINGS: 'settings',
  WEBHOOK: 'webhook',
  RATE_LIMIT: 'rate_limit',
  FEATURE_FLAG: 'feature_flag',
} as const;
