import type { APIRoute } from 'astro';
import { 
  getArticleBySlug,
  restoreSnapshot
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../../../lib/api-utils';

/**
 * POST /api/v1/articles/[slug]/rollback
 * Rollback article to a previous snapshot
 * 
 * Body:
 * - snapshotId: number (required)
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Fetch article to verify it exists
    await getArticleBySlug(slug);

    // Parse body
    const body = await request.json();
    const { snapshotId } = body;

    if (!snapshotId) {
      return errorResponse('VALIDATION_ERROR', 'Snapshot ID is required', 400);
    }

    // Restore snapshot
    await restoreSnapshot(snapshotId);

    return successResponse({
      success: true,
      message: 'Article rolled back successfully',
      snapshotId
    });
  } catch (error) {
    console.error('Error rolling back article:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article or snapshot not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to rollback article',
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
