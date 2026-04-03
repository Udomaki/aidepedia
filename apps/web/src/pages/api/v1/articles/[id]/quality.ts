import type { APIRoute } from 'astro';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';
import { getQualityScore, calculateQualityScore, saveQualityScore } from '../../../../../lib/quality-scoring';

/**
 * GET /api/v1/articles/[id]/quality
 * Get quality score breakdown for an article
 * 
 * Query params:
 * - recalculate: If 'true', recalculate the score before returning
 */
export const GET: APIRoute = async ({ params, url }) => {
  const articleId = parseInt(params.id);
  if (isNaN(articleId)) {
    return errorResponse('VALIDATION_ERROR', 'Invalid article ID', 400);
  }
  
  const shouldRecalculate = url.searchParams.get('recalculate') === 'true';
  
  try {
    let qualityScore;
    
    if (shouldRecalculate) {
      // Recalculate and save
      qualityScore = await calculateQualityScore(articleId);
      await saveQualityScore(articleId, qualityScore, 'system_recalc');
    } else {
      // Try to get existing score
      qualityScore = await getQualityScore(articleId);
      
      if (!qualityScore) {
        // No existing score, calculate it
        qualityScore = await calculateQualityScore(articleId);
        await saveQualityScore(articleId, qualityScore, 'initial');
      }
    }
    
    return successResponse({
      articleId,
      qualityScore,
    });
  } catch (error) {
    console.error('Error fetching quality score:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch quality score',
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
