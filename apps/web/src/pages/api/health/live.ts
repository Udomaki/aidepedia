import type { APIRoute } from 'astro';
import { livenessCheck } from '../../../lib/health';

/**
 * Liveness check endpoint
 * GET /api/health/live - Returns 200 if app is alive
 * Used by orchestrators to determine if the app should be restarted
 */
export const GET: APIRoute = async () => {
  const result = livenessCheck();
  
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
};
