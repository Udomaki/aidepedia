import type { APIRoute } from 'astro';
import { 
  generateArticleEmbedding,
  batchGenerateEmbeddings,
  getEmbeddingStats,
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/admin/embeddings/stats
 * Get embedding statistics
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const stats = await getEmbeddingStats();

    return successResponse({
      ...stats,
      coverage: `${stats.coverage.toFixed(2)}%`,
    });
  } catch (error) {
    console.error('Error fetching embedding stats:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch embedding statistics',
      500
    );
  }
};

/**
 * POST /api/v1/admin/embeddings
 * Generate embeddings for articles
 * 
 * Body:
 * - articleId: Single article ID (optional)
 * - articleIds: Array of article IDs (optional)
 * - all: Boolean to generate for all published articles (optional)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { articleId, articleIds, all } = body;

    // Generate embedding for single article
    if (articleId) {
      await generateArticleEmbedding(articleId);
      return successResponse({
        message: `Embedding generated for article ${articleId}`,
        articleId,
      });
    }

    // Generate embeddings for multiple articles
    if (articleIds && Array.isArray(articleIds)) {
      const results = await batchGenerateEmbeddings(articleIds);
      return successResponse({
        message: 'Batch embedding generation complete',
        ...results,
      });
    }

    // Generate embeddings for all published articles
    if (all) {
      const results = await batchGenerateEmbeddings();
      return successResponse({
        message: 'Full embedding generation complete',
        ...results,
      });
    }

    return errorResponse(
      'VALIDATION_ERROR',
      'Provide articleId, articleIds, or all=true',
      400
    );
  } catch (error) {
    console.error('Error generating embeddings:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to generate embeddings',
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
