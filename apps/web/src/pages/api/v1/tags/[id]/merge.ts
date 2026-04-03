import type { APIRoute } from 'astro';
import { 
  mergeTags,
  getTagById,
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
} from '../../../../../lib/api-utils';

/**
 * POST /api/v1/tags/[id]/merge
 * Merge this tag into another tag
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;

    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Tag ID is required', 400);
    }

    const tagId = parseInt(id, 10);
    if (isNaN(tagId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid tag ID', 400);
    }

    const body = await request.json();
    const { targetTagId } = body;

    if (!targetTagId) {
      return errorResponse('VALIDATION_ERROR', 'targetTagId is required', 400);
    }

    const targetId = parseInt(targetTagId, 10);
    if (isNaN(targetId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid target tag ID', 400);
    }

    // Verify both tags exist
    await getTagById(tagId);
    await getTagById(targetId);

    // Merge tags
    const result = await mergeTags(tagId, targetId);

    return successResponse({
      message: 'Tags merged successfully',
      sourceTagId: tagId,
      targetTagId: targetId,
      articlesUpdated: result.articlesUpdated,
    });
  } catch (error) {
    console.error('Error merging tags:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return errorResponse('NOT_FOUND', error.message, 404);
      }
      if (error.message.includes('Cannot merge')) {
        return errorResponse('VALIDATION_ERROR', error.message, 400);
      }
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to merge tags',
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
