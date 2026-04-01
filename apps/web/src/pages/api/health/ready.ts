import type { APIRoute } from 'astro';
import { readinessCheck } from '../../../lib/health';

/**
 * Readiness check endpoint
 * GET /api/health/ready - Returns 200 if app is ready to handle requests, 503 otherwise
 * Used by orchestrators (Kubernetes, etc.) to determine if traffic should be routed
 */
export const GET: APIRoute = async () => {
  try {
    const result = await readinessCheck();
    
    const statusCode = result.ready ? 200 : 503;
    
    return new Response(JSON.stringify(result), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ready: false,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Readiness check failed',
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }
};
