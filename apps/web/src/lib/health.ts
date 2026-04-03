/**
 * Health check utilities for system monitoring
 */

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: ComponentHealth;
    memory: ComponentHealth;
    disk?: ComponentHealth;
    external?: Record<string, ComponentHealth>;
  };
}

export interface ComponentHealth {
  status: 'ok' | 'error' | 'warn';
  message?: string;
  latency?: number;
  details?: Record<string, unknown>;
}

export interface HealthStatus {
  healthy: boolean;
  timestamp: string;
  checks: Record<string, ComponentHealth>;
}

// Track start time for uptime calculation
const startTime = Date.now();

/**
 * Check database connectivity
 */
export async function checkDatabase(): Promise<ComponentHealth> {
  const start = Date.now();
  try {
    // Dynamic import to avoid circular dependencies
    const { db, sql } = await import('@aidepedia/db');
    
    // Simple query to verify connection
    await db.execute(sql`SELECT 1 as health_check`);
    
    return {
      status: 'ok',
      latency: Date.now() - start,
      message: 'Database connection successful',
    };
  } catch (error) {
    return {
      status: 'error',
      latency: Date.now() - start,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

/**
 * Check memory usage
 */
export function checkMemory(): ComponentHealth {
  try {
    // Check if we're in a Node.js environment with memory APIs
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const heapUsagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
      const rssMB = Math.round(memUsage.rss / 1024 / 1024);
      
      let status: 'ok' | 'warn' | 'error' = 'ok';
      let message = 'Memory usage normal';
      
      if (heapUsagePercent > 90) {
        status = 'error';
        message = 'Critical memory usage';
      } else if (heapUsagePercent > 75) {
        status = 'warn';
        message = 'High memory usage';
      }
      
      return {
        status,
        message,
        details: {
          heapUsedMB,
          heapTotalMB,
          heapUsagePercent,
          rssMB,
          externalMB: Math.round(memUsage.external / 1024 / 1024),
        },
      };
    }
    
    // Edge runtime (Cloudflare Workers) - memory APIs not available
    return {
      status: 'ok',
      message: 'Memory check not available in edge runtime',
      details: {
        environment: 'edge',
        available: false,
      },
    };
  } catch (error) {
    return {
      status: 'ok', // Don't fail on memory check errors in edge
      message: 'Memory check unavailable',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

/**
 * Check disk space (best effort - may not work in all environments)
 */
export async function checkDisk(): Promise<ComponentHealth> {
  try {
    // Edge runtime (Cloudflare Workers) - disk APIs not available
    if (typeof process === 'undefined' || !process.platform) {
      return {
        status: 'ok',
        message: 'Disk check not available in edge runtime',
        details: {
          environment: 'edge',
          available: false,
        },
      };
    }
    
    // Use Node.js fs to check disk stats
    // Note: This is a simplified check - in production you might use a library
    const { execSync } = await import('child_process');
    
    let diskInfo: { free?: number; total?: number; usedPercent?: number } = {};
    
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const output = execSync('df -k / | tail -1', { encoding: 'utf-8' }).trim();
        const parts = output.split(/\s+/);
        if (parts.length >= 4) {
          const total = parseInt(parts[1], 10) * 1024; // Convert to bytes
          const used = parseInt(parts[2], 10) * 1024;
          const free = parseInt(parts[3], 10) * 1024;
          diskInfo = {
            total,
            free,
            usedPercent: Math.round((used / total) * 100),
          };
        }
      }
    } catch {
      // In containerized environments, df might not be available
      diskInfo = { free: undefined, total: undefined, usedPercent: undefined };
    }
    
    if (diskInfo.usedPercent === undefined) {
      return {
        status: 'ok',
        message: 'Disk check unavailable in this environment',
        details: { available: false },
      };
    }
    
    let status: 'ok' | 'warn' | 'error' = 'ok';
    let message = 'Disk space sufficient';
    
    if (diskInfo.usedPercent > 95) {
      status = 'error';
      message = 'Critical disk usage';
    } else if (diskInfo.usedPercent > 85) {
      status = 'warn';
      message = 'High disk usage';
    }
    
    return {
      status,
      message,
      details: {
        freeGB: diskInfo.free ? Math.round(diskInfo.free / 1024 / 1024 / 1024) : undefined,
        totalGB: diskInfo.total ? Math.round(diskInfo.total / 1024 / 1024 / 1024) : undefined,
        usedPercent: diskInfo.usedPercent,
      },
    };
  } catch (error) {
    return {
      status: 'ok', // Don't fail on disk check errors
      message: 'Could not check disk space',
      details: { error: error instanceof Error ? error.message : 'Unknown error' },
    };
  }
}

/**
 * Check external API connectivity
 */
export async function checkExternalAPIs(): Promise<Record<string, ComponentHealth>> {
  const results: Record<string, ComponentHealth> = {};
  
  // Check Brickognize API if configured
  const brickognizeUrl = process.env.BRICKOGNIZE_API_URL || 'https://api.brickognize.com';
  
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${brickognizeUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    }).catch(() => null);
    
    clearTimeout(timeoutId);
    
    if (response && response.ok) {
      results.brickognize = {
        status: 'ok',
        latency: Date.now() - start,
        message: 'Brickognize API reachable',
      };
    } else if (response) {
      results.brickognize = {
        status: 'warn',
        latency: Date.now() - start,
        message: `Brickognize API returned status ${response.status}`,
      };
    } else {
      results.brickognize = {
        status: 'warn',
        message: 'Brickognize API health endpoint not available',
      };
    }
  } catch {
    results.brickognize = {
      status: 'warn',
      message: 'Could not reach Brickognize API',
    };
  }
  
  return results;
}

/**
 * Perform a full health check
 */
export async function performHealthCheck(includeExternal = false): Promise<HealthCheckResult> {
  const [database, disk, external] = await Promise.all([
    checkDatabase(),
    checkDisk(),
    includeExternal ? checkExternalAPIs() : Promise.resolve(undefined),
  ]);
  
  const memory = checkMemory();
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  // Determine overall status
  let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
  
  if (database.status === 'error') {
    status = 'unhealthy';
  } else if (
    memory.status === 'error' ||
    (disk && disk.status === 'error')
  ) {
    status = 'unhealthy';
  } else if (
    database.status === 'warn' ||
    memory.status === 'warn' ||
    (disk && disk.status === 'warn') ||
    (external && Object.values(external).some(e => e.status === 'warn'))
  ) {
    status = 'degraded';
  }
  
  return {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime,
    checks: {
      database,
      memory,
      disk,
      external,
    },
  };
}

/**
 * Simple liveness check - just verify the app responds
 */
export function livenessCheck(): { alive: boolean; timestamp: string } {
  return {
    alive: true,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Readiness check - verify app can handle requests
 */
export async function readinessCheck(): Promise<{ ready: boolean; timestamp: string; checks: Record<string, boolean> }> {
  const database = await checkDatabase();
  const memory = checkMemory();
  
  const checks = {
    database: database.status !== 'error',
    memory: memory.status !== 'error',
  };
  
  const ready = Object.values(checks).every(v => v);
  
  return {
    ready,
    timestamp: new Date().toISOString(),
    checks,
  };
}

// Store health history for admin dashboard
interface HealthHistoryEntry {
  timestamp: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
}

const healthHistory: HealthHistoryEntry[] = [];
const MAX_HISTORY_SIZE = 1000;

/**
 * Record a health check result in history
 */
export function recordHealthHistory(result: HealthCheckResult, responseTime: number): void {
  healthHistory.push({
    timestamp: result.timestamp,
    status: result.status,
    responseTime,
  });
  
  // Trim old entries
  if (healthHistory.length > MAX_HISTORY_SIZE) {
    healthHistory.shift();
  }
}

/**
 * Get health history for dashboard
 */
export function getHealthHistory(hours = 24): HealthHistoryEntry[] {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return healthHistory.filter(entry => entry.timestamp >= cutoff);
}

/**
 * Get health statistics
 */
export function getHealthStats(hours = 24): {
  total: number;
  healthy: number;
  unhealthy: number;
  degraded: number;
  uptimePercent: number;
  avgResponseTime: number;
} {
  const history = getHealthHistory(hours);
  const total = history.length;
  
  if (total === 0) {
    return {
      total: 0,
      healthy: 0,
      unhealthy: 0,
      degraded: 0,
      uptimePercent: 100,
      avgResponseTime: 0,
    };
  }
  
  const healthy = history.filter(h => h.status === 'healthy').length;
  const unhealthy = history.filter(h => h.status === 'unhealthy').length;
  const degraded = history.filter(h => h.status === 'degraded').length;
  
  const avgResponseTime = Math.round(
    history.reduce((sum, h) => sum + h.responseTime, 0) / total
  );
  
  return {
    total,
    healthy,
    unhealthy,
    degraded,
    uptimePercent: Math.round(((healthy + degraded) / total) * 100),
    avgResponseTime,
  };
}
