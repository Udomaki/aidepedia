import { db, slow_query_logs, api_performance, desc, gte, and, count, sql, avg } from '@aidepedia/db';

const SLOW_QUERY_THRESHOLD = 100; // 100ms
const ALERT_THRESHOLD = 1000; // 1 second

export interface SlowQueryLog {
  id: number;
  query: string;
  duration: number;
  endpoint?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ApiPerformanceMetrics {
  endpoint: string;
  method: string;
  totalRequests: number;
  avgResponseTime: number;
  maxResponseTime: number;
  minResponseTime: number;
  p95ResponseTime: number;
  errorRate: number;
}

/**
 * Log a slow query to the database
 */
export async function logSlowQuery(
  query: string,
  duration: number,
  endpoint?: string,
  metadata?: Record<string, unknown>,
  userAgent?: string,
  ipAddress?: string
): Promise<void> {
  try {
    // Only log if duration exceeds threshold
    if (duration > SLOW_QUERY_THRESHOLD) {
      await db.insert(slow_query_logs).values({
        query,
        duration,
        endpoint,
        metadata,
        userAgent,
        ipAddress,
      });

      // Alert if extremely slow (> 1s)
      if (duration > ALERT_THRESHOLD) {
        console.warn(`[PERF ALERT] Extremely slow query detected: ${duration}ms at ${endpoint}`);
        console.warn('Query:', query.substring(0, 200));
      }
    }
  } catch (error) {
    console.error('Failed to log slow query:', error);
  }
}

/**
 * Log API performance metrics
 */
export async function logApiPerformance(
  endpoint: string,
  method: string,
  responseTime: number,
  statusCode: number,
  userId?: number,
  userAgent?: string,
  ipAddress?: string
): Promise<void> {
  try {
    await db.insert(api_performance).values({
      endpoint,
      method,
      responseTime,
      statusCode,
      userId,
      userAgent,
      ipAddress,
    });

    // Alert if response time exceeds 1s
    if (responseTime > ALERT_THRESHOLD) {
      console.warn(`[PERF ALERT] Slow API response: ${responseTime}ms for ${method} ${endpoint}`);
    }
  } catch (error) {
    console.error('Failed to log API performance:', error);
  }
}

/**
 * Get slow queries with optional filtering
 */
export async function getSlowQueries(
  limit: number = 100,
  minDuration?: number,
  hours?: number
): Promise<SlowQueryLog[]> {
  try {
    const conditions = [];
    
    if (minDuration) {
      conditions.push(gte(slow_query_logs.duration, minDuration));
    }
    
    if (hours) {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      conditions.push(gte(slow_query_logs.createdAt, cutoff));
    }

    const query = db
      .select()
      .from(slow_query_logs)
      .orderBy(desc(slow_query_logs.duration))
      .limit(limit);

    if (conditions.length > 0) {
      return await query.where(and(...conditions));
    }

    return await query;
  } catch (error) {
    console.error('Failed to get slow queries:', error);
    return [];
  }
}

/**
 * Get API performance metrics for a time period
 */
export async function getApiPerformanceMetrics(hours: number = 24): Promise<ApiPerformanceMetrics[]> {
  try {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const result = await db
      .select({
        endpoint: api_performance.endpoint,
        method: api_performance.method,
        totalRequests: count(),
        avgResponseTime: avg(api_performance.responseTime),
        maxResponseTime: sql<number>`MAX(${api_performance.responseTime})`,
        minResponseTime: sql<number>`MIN(${api_performance.responseTime})`,
        // Calculate P95 (approximate)
        p95ResponseTime: sql<number>`
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${api_performance.responseTime})
        `,
        // Calculate error rate (4xx and 5xx status codes)
        errorRate: sql<number>`
          (COUNT(CASE WHEN ${api_performance.statusCode} >= 400 THEN 1 END)::float / COUNT(*)::float * 100)
        `,
      })
      .from(api_performance)
      .where(gte(api_performance.createdAt, cutoff))
      .groupBy(api_performance.endpoint, api_performance.method)
      .orderBy(desc(sql`avg_response_time`));

    return result.map(row => ({
      endpoint: row.endpoint,
      method: row.method,
      totalRequests: Number(row.totalRequests),
      avgResponseTime: Number(row.avgResponseTime || 0),
      maxResponseTime: Number(row.maxResponseTime || 0),
      minResponseTime: Number(row.minResponseTime || 0),
      p95ResponseTime: Number(row.p95ResponseTime || 0),
      errorRate: Number(row.errorRate || 0),
    }));
  } catch (error) {
    console.error('Failed to get API performance metrics:', error);
    return [];
  }
}

/**
 * Wrapper for database queries to automatically track performance
 */
export async function trackQueryPerformance<T>(
  queryName: string,
  queryFn: () => Promise<T>,
  endpoint?: string,
  metadata?: Record<string, unknown>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await queryFn();
    const duration = Date.now() - startTime;
    
    // Log slow queries
    await logSlowQuery(queryName, duration, endpoint, metadata);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    // Also log slow queries that failed
    await logSlowQuery(
      `${queryName} (FAILED)`,
      duration,
      endpoint,
      { ...metadata, error: error instanceof Error ? error.message : 'Unknown error' }
    );
    
    throw error;
  }
}

/**
 * Get performance summary for dashboard
 */
export async function getPerformanceSummary(hours: number = 24) {
  try {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    // Get slow query count
    const slowQueryCount = await db
      .select({ count: count() })
      .from(slow_query_logs)
      .where(gte(slow_query_logs.createdAt, cutoff));
    
    // Get average API response time
    const avgResponseTime = await db
      .select({ avg: avg(api_performance.responseTime) })
      .from(api_performance)
      .where(gte(api_performance.createdAt, cutoff));
    
    // Get total API requests
    const totalRequests = await db
      .select({ count: count() })
      .from(api_performance)
      .where(gte(api_performance.createdAt, cutoff));
    
    // Get error rate
    const errorStats = await db
      .select({
        total: count(),
        errors: sql<number>`COUNT(CASE WHEN ${api_performance.statusCode} >= 400 THEN 1 END)`,
      })
      .from(api_performance)
      .where(gte(api_performance.createdAt, cutoff));

    const totalReq = Number(totalRequests[0]?.count || 0);
    const errors = Number(errorStats[0]?.errors || 0);
    
    return {
      slowQueryCount: Number(slowQueryCount[0]?.count || 0),
      avgResponseTime: Number(avgResponseTime[0]?.avg || 0),
      totalRequests: totalReq,
      errorRate: totalReq > 0 ? (errors / totalReq) * 100 : 0,
    };
  } catch (error) {
    console.error('Failed to get performance summary:', error);
    return {
      slowQueryCount: 0,
      avgResponseTime: 0,
      totalRequests: 0,
      errorRate: 0,
    };
  }
}
