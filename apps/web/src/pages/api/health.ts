import type { APIRoute } from 'astro';
import { performHealthCheck, recordHealthHistory } from '../../lib/health';

/**
 * Basic health check endpoint
 * GET /api/health - Returns full health status
 */
export const GET: APIRoute = async () => {
  const startTime = Date.now();
  
  try {
    const health = await performHealthCheck(true);
    const responseTime = Date.now() - startTime;
    
    // Record for history/dashboard
    recordHealthHistory(health, responseTime);
    
    // Return 503 if unhealthy
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    
    return new Response(JSON.stringify({
      ...health,
      responseTime,
    }), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed',
      responseTime: Date.now() - startTime,
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }
};
