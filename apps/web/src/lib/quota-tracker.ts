/**
 * Quota Tracker for API Rate Limiting
 * 
 * Features:
 * - Database-backed quota tracking
 * - Tier-based limits (free, pro, enterprise)
 * - Hourly and monthly quota tracking
 * - Automatic window reset
 */

import { db, sql, eq } from '@aidepedia/db';
import { api_quotas } from '@aidepedia/db/schema';

export type QuotaTier = 'free' | 'pro' | 'enterprise';

export interface QuotaLimits {
  hourlyLimit: number;
  monthlyLimit: number;
}

export interface QuotaStatus {
  tier: QuotaTier;
  hourlyUsed: number;
  hourlyLimit: number;
  hourlyRemaining: number;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyRemaining: number;
  windowReset: Date;
  monthReset: Date;
}

// Default limits per tier
const TIER_LIMITS: Record<QuotaTier, QuotaLimits> = {
  free: {
    hourlyLimit: 100,
    monthlyLimit: 10000,
  },
  pro: {
    hourlyLimit: 1000,
    monthlyLimit: 100000,
  },
  enterprise: {
    hourlyLimit: 10000,
    monthlyLimit: 1000000,
  },
};

/**
 * Hash an IP address for privacy using Web Crypto API
 */
async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get quota limits for a tier
 */
export function getQuotaLimits(tier: QuotaTier): QuotaLimits {
  return TIER_LIMITS[tier];
}

/**
 * Get or create quota record for a user
 */
export async function getUserQuota(userId: number): Promise<QuotaStatus> {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Try to get existing quota
  let quotas = await db
    .select()
    .from(api_quotas)
    .where(eq(api_quotas.userId, userId))
    .limit(1);

  let quota = quotas[0];

  if (!quota) {
    // Create new quota record
    const created = await db
      .insert(api_quotas)
      .values({
        userId,
        tier: 'free',
        requestCount: 0,
        windowStart: now,
        monthlyRequestCount: 0,
        monthStart: now,
      })
      .returning();
    quota = created[0];
  }

  // Check if we need to reset hourly window
  if (quota.windowStart < hourAgo) {
    await db
      .update(api_quotas)
      .set({
        requestCount: 0,
        windowStart: now,
        updatedAt: now,
      })
      .where(eq(api_quotas.id, quota.id));
    quota.requestCount = 0;
    quota.windowStart = now;
  }

  // Check if we need to reset monthly window
  if (quota.monthStart < monthAgo) {
    await db
      .update(api_quotas)
      .set({
        monthlyRequestCount: 0,
        monthStart: now,
        updatedAt: now,
      })
      .where(eq(api_quotas.id, quota.id));
    quota.monthlyRequestCount = 0;
    quota.monthStart = now;
  }

  const limits = getQuotaLimits(quota.tier as QuotaTier);

  return {
    tier: quota.tier as QuotaTier,
    hourlyUsed: quota.requestCount,
    hourlyLimit: limits.hourlyLimit,
    hourlyRemaining: Math.max(0, limits.hourlyLimit - quota.requestCount),
    monthlyUsed: quota.monthlyRequestCount,
    monthlyLimit: limits.monthlyLimit,
    monthlyRemaining: Math.max(0, limits.monthlyLimit - quota.monthlyRequestCount),
    windowReset: new Date(quota.windowStart.getTime() + 60 * 60 * 1000),
    monthReset: new Date(quota.monthStart.getTime() + 30 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Get or create quota record for an anonymous IP
 */
export async function getIPQuota(ip: string): Promise<QuotaStatus> {
  const ipHash = await hashIP(ip);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Try to get existing quota
  let quotas = await db
    .select()
    .from(api_quotas)
    .where(eq(api_quotas.ipHash, ipHash))
    .limit(1);

  let quota = quotas[0];

  if (!quota) {
    // Create new quota record
    const created = await db
      .insert(api_quotas)
      .values({
        ipHash,
        tier: 'free',
        requestCount: 0,
        windowStart: now,
        monthlyRequestCount: 0,
        monthStart: now,
      })
      .returning();
    quota = created[0];
  }

  // Check if we need to reset hourly window
  if (quota.windowStart < hourAgo) {
    await db
      .update(api_quotas)
      .set({
        requestCount: 0,
        windowStart: now,
        updatedAt: now,
      })
      .where(eq(api_quotas.id, quota.id));
    quota.requestCount = 0;
    quota.windowStart = now;
  }

  // Check if we need to reset monthly window
  if (quota.monthStart < monthAgo) {
    await db
      .update(api_quotas)
      .set({
        monthlyRequestCount: 0,
        monthStart: now,
        updatedAt: now,
      })
      .where(eq(api_quotas.id, quota.id));
    quota.monthlyRequestCount = 0;
    quota.monthStart = now;
  }

  const limits = getQuotaLimits(quota.tier as QuotaTier);

  return {
    tier: quota.tier as QuotaTier,
    hourlyUsed: quota.requestCount,
    hourlyLimit: limits.hourlyLimit,
    hourlyRemaining: Math.max(0, limits.hourlyLimit - quota.requestCount),
    monthlyUsed: quota.monthlyRequestCount,
    monthlyLimit: limits.monthlyLimit,
    monthlyRemaining: Math.max(0, limits.monthlyLimit - quota.monthlyRequestCount),
    windowReset: new Date(quota.windowStart.getTime() + 60 * 60 * 1000),
    monthReset: new Date(quota.monthStart.getTime() + 30 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Increment quota usage for a user
 */
export async function incrementUserQuota(userId: number): Promise<void> {
  const now = new Date();

  await db
    .update(api_quotas)
    .set({
      requestCount: sql`${api_quotas.requestCount} + 1`,
      monthlyRequestCount: sql`${api_quotas.monthlyRequestCount} + 1`,
      updatedAt: now,
    })
    .where(eq(api_quotas.userId, userId));
}

/**
 * Increment quota usage for an IP
 */
export async function incrementIPQuota(ip: string): Promise<void> {
  const ipHash = await hashIP(ip);
  const now = new Date();

  await db
    .update(api_quotas)
    .set({
      requestCount: sql`${api_quotas.requestCount} + 1`,
      monthlyRequestCount: sql`${api_quotas.monthlyRequestCount} + 1`,
      updatedAt: now,
    })
    .where(eq(api_quotas.ipHash, ipHash));
}

/**
 * Update user tier
 */
export async function updateUserTier(userId: number, tier: QuotaTier): Promise<void> {
  const now = new Date();

  await db
    .update(api_quotas)
    .set({
      tier,
      updatedAt: now,
    })
    .where(eq(api_quotas.userId, userId));
}
