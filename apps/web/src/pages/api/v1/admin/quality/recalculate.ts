import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';
import { recalculateAllQualityScores } from '../../../../../lib/quality-scoring';

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
 * POST /api/v1/admin/quality/recalculate
 * Recalculate quality scores for all articles
 * 
 * Requires: Admin role
 * 
 * Body params:
 * - batchSize: Number of articles to process in parallel (default: 50)
 */
export const POST: APIRoute = async ({ request }) => {
  // Check admin authorization
  const admin = await requireAdmin(request);
  if (!admin) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }
  
  try {
    // Get batch size from request body
    let batchSize = 50;
    try {
      const body = await request.json();
      if (body.batchSize && typeof body.batchSize === 'number' && body.batchSize > 0) {
        batchSize = Math.min(100, body.batchSize); // Cap at 100
      }
    } catch {
      // No body or invalid JSON, use default
    }
    
    // Recalculate all scores
    const result = await recalculateAllQualityScores(batchSize);
    
    return successResponse({
      message: 'Quality score recalculation completed',
      total: result.total,
      updated: result.updated,
      errors: result.errors.length,
      errorDetails: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined, // Limit error details
    });
  } catch (error) {
    console.error('Error recalculating quality scores:', error);
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to recalculate quality scores',
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
