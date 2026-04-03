/**
 * API Usage Tracking Utilities
 * OC-124: API Monetization - Usage tracking and metering
 */

import { db, eq, and, gte, lte, sql } from '@aidepedia/db';
import { api_keys, api_usage, api_usage_aggregates } from '@aidepedia/db/schema';

/**
 * Track API usage
 */
export async function trackApiUsage(params: {
  apiKey: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  requestSize?: number;
  responseSize?: number;
  userAgent?: string;
  ipAddress?: string;
}): Promise<void> {
  try {
    // Get API key details
    const [keyDetails] = await db
      .select()
      .from(api_keys)
      .where(eq(api_keys.key, params.apiKey))
      .limit(1);
    
    if (!keyDetails) {
      throw new Error('Invalid API key');
    }
    
    // Record usage
    await db.insert(api_usage).values({
      apiKeyId: keyDetails.id,
      userId: keyDetails.userId,
      endpoint: params.endpoint,
      method: params.method,
      statusCode: params.statusCode,
      responseTime: params.responseTime,
      requestSize: params.requestSize,
      responseSize: params.responseSize,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress
    });
    
    // Update last used timestamp
    await db
      .update(api_keys)
      .set({ lastUsedAt: new Date() })
      .where(eq(api_keys.id, keyDetails.id));
  } catch (error) {
    console.error('Error tracking API usage:', error);
    // Don't throw - usage tracking should not break the request
  }
}

/**
 * Get usage statistics for a user
 */
export async function getUserUsageStats(userId: number, period: 'day' | 'week' | 'month' = 'month') {
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }
  
  // Get total requests
  const [totalStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      successful: sql<number>`count(*) filter (where ${api_usage.statusCode} >= 200 and ${api_usage.statusCode} < 300)::int`,
      failed: sql<number>`count(*) filter (where ${api_usage.statusCode} >= 400)::int`,
      avgResponseTime: sql<number>`avg(${api_usage.responseTime})::int`,
      totalDataTransferred: sql<number>`coalesce(sum(${api_usage.responseSize}), 0)::int`
    })
    .from(api_usage)
    .where(and(
      eq(api_usage.userId, userId),
      gte(api_usage.createdAt, startDate)
    ));
  
  // Get requests by endpoint
  const endpointStats = await db
    .select({
      endpoint: api_usage.endpoint,
      method: api_usage.method,
      count: sql<number>`count(*)::int`,
      avgResponseTime: sql<number>`avg(${api_usage.responseTime})::int`
    })
    .from(api_usage)
    .where(and(
      eq(api_usage.userId, userId),
      gte(api_usage.createdAt, startDate)
    ))
    .groupBy(api_usage.endpoint, api_usage.method)
    .orderBy(sql`count(*) desc`)
    .limit(10);
  
  // Get daily breakdown
  const dailyStats = await db
    .select({
      date: sql<string>`date(${api_usage.createdAt})`,
      count: sql<number>`count(*)::int`
    })
    .from(api_usage)
    .where(and(
      eq(api_usage.userId, userId),
      gte(api_usage.createdAt, startDate)
    ))
    .groupBy(sql`date(${api_usage.createdAt})`)
    .orderBy(sql`date(${api_usage.createdAt})`);
  
  return {
    total: totalStats.total || 0,
    successful: totalStats.successful || 0,
    failed: totalStats.failed || 0,
    avgResponseTime: totalStats.avgResponseTime || 0,
    totalDataTransferred: totalStats.totalDataTransferred || 0,
    topEndpoints: endpointStats,
    dailyBreakdown: dailyStats
  };
}

/**
 * Get usage statistics for an API key
 */
export async function getApiKeyUsageStats(apiKeyId: number, period: 'day' | 'week' | 'month' = 'month') {
  const now = new Date();
  let startDate: Date;
  
  switch (period) {
    case 'day':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }
  
  const [totalStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      successful: sql<number>`count(*) filter (where ${api_usage.statusCode} >= 200 and ${api_usage.statusCode} < 300)::int`,
      failed: sql<number>`count(*) filter (where ${api_usage.statusCode} >= 400)::int`,
      avgResponseTime: sql<number>`avg(${api_usage.responseTime})::int`,
      totalDataTransferred: sql<number>`coalesce(sum(${api_usage.responseSize}), 0)::int`
    })
    .from(api_usage)
    .where(and(
      eq(api_usage.apiKeyId, apiKeyId),
      gte(api_usage.createdAt, startDate)
    ));
  
  return {
    total: totalStats.total || 0,
    successful: totalStats.successful || 0,
    failed: totalStats.failed || 0,
    avgResponseTime: totalStats.avgResponseTime || 0,
    totalDataTransferred: totalStats.totalDataTransferred || 0
  };
}

/**
 * Check if API key has exceeded quota
 */
export async function checkApiQuota(apiKey: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}> {
  const [keyDetails] = await db
    .select()
    .from(api_keys)
    .where(eq(api_keys.key, apiKey))
    .limit(1);
  
  if (!keyDetails) {
    throw new Error('Invalid API key');
  }
  
  // Get current month's usage
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const [usage] = await db
    .select({
      count: sql<number>`count(*)::int`
    })
    .from(api_usage)
    .where(and(
      eq(api_usage.apiKeyId, keyDetails.id),
      gte(api_usage.createdAt, monthStart)
    ));
  
  const used = usage.count || 0;
  const limit = keyDetails.monthlyQuota;
  const remaining = Math.max(0, limit - used);
  
  // Calculate reset date (first day of next month)
  const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  
  return {
    allowed: used < limit,
    remaining,
    limit,
    resetAt
  };
}
