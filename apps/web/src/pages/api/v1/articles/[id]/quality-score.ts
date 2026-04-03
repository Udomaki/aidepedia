import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';
import { calculateQualityScore, saveQualityScore } from '../../../../../lib/quality-scoring';

/**
 * Editor/Admin check helper
 */
async function requireEditor(request: Request): Promise<{ authorized: boolean; userId?: number }> {
  try {
    const session = await getSession(request);
    if (!session?.user) {
      return { authorized: false };
    }
    
    const user = session.user as any;
    const isEditor = user?.role === 'editor' || user?.role === 'admin' || 
                   user?.tier === 'editor' || user?.tier === 'admin';
    
    return { 
      authorized: isEditor,
      userId: user?.id 
    };
  } catch {
    return { authorized: false };
  }
}

/**
 * POST /api/v1/articles/[id]/quality-score
 * Calculate and save quality score for an article
 * 
 * Requires: Editor or Admin role
 */
export const POST: APIRoute = async ({ params, request }) => {
  // Check authorization
  const auth = await requireEditor(request);
  if (!auth.authorized) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }
  
  const articleId = parseInt(params.id);
  if (isNaN(articleId)) {
    return errorResponse('VALIDATION_ERROR', 'Invalid article ID', 400);
  }
  
  try {
    // Get optional change reason from request body
    let changeReason: 'content_update' | 'engagement_update' | 'manual_review' | 'system_recalc' = 'manual_review';
    try {
      const body = await request.json();
      if (body.changeReason && ['content_update', 'engagement_update', 'manual_review', 'system_recalc'].includes(body.changeReason)) {
        changeReason = body.changeReason;
      }
    } catch {
      // No body or invalid JSON, use default
    }
    
    // Calculate quality score
    const qualityScore = await calculateQualityScore(articleId);
    
    // Save to database
    await saveQualityScore(articleId, qualityScore, changeReason);
    
    return successResponse({
      articleId,
      qualityScore,
      message: 'Quality score calculated and saved successfully',
    });
  } catch (error) {
    console.error('Error calculating quality score:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to calculate quality score',
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
