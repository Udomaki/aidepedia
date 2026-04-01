import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import {
  getAllRateLimitStatuses,
  getBlockedIPs,
  unblockIP,
  resetRateLimit,
} from '../../../lib/rate-limiter';

/**
 * Admin check helper
 */
async function requireAdmin(request: Request): Promise<boolean> {
  try {
    const session = await getSession(request);
    if (!session?.user) return false;
    
    const user = session.user as any;
    return user?.role === 'admin' || user?.tier === 'admin';
  } catch {
    return false;
  }
}

/**
 * GET /api/admin/rate-limits
 * Get all rate limit statuses and blocked IPs
 */
export const GET: APIRoute = async ({ request }) => {
  // Check admin authorization
  const admin = await requireAdmin(request);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  try {
    const statuses = getAllRateLimitStatuses();
    const blockedIPs = getBlockedIPs();
    
    return new Response(
      JSON.stringify({
        statuses,
        blockedIPs,
        totalActive: statuses.length,
        totalBlocked: blockedIPs.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error fetching rate limits:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * POST /api/admin/rate-limits
 * Unblock or reset rate limit for an IP
 */
export const POST: APIRoute = async ({ request }) => {
  // Check admin authorization
  const admin = await requireAdmin(request);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  try {
    const body = await request.json();
    const { action, ip } = body;
    
    if (!ip) {
      return new Response(JSON.stringify({ error: 'IP address required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    switch (action) {
      case 'unblock':
        const unblocked = unblockIP(ip);
        return new Response(
          JSON.stringify({
            success: unblocked,
            message: unblocked ? 'IP unblocked successfully' : 'IP was not blocked',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
        
      case 'reset':
        const reset = resetRateLimit(ip);
        return new Response(
          JSON.stringify({
            success: reset,
            message: reset ? 'Rate limit reset successfully' : 'No rate limit entry found',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
        
      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Error managing rate limits:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
