import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';
import { getQualityAnalytics } from '../../../../../lib/quality-scoring';

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
 * GET /api/v1/admin/quality/analytics
 * Get quality analytics for the dashboard
 * 
 * Requires: Admin role
 */
export const GET: APIRoute = async ({ request }) => {
  // Check admin authorization
  const admin = await requireAdmin(request);
  if (!admin) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }
  
  try {
    // Get analytics
    const analytics = await getQualityAnalytics();
    
    return successResponse(analytics);
  } catch (error) {
    console.error('Error fetching quality analytics:', error);
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch quality analytics',
      500
    );
  }
};

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
