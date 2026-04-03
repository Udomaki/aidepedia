import type { APIRoute } from 'astro';
import { resolveMergeConflicts } from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../../../lib/api-utils';

/**
 * POST /api/v1/merge/[id]/resolve
 * Resolve merge conflicts
 * 
 * Body:
 * - resolutions: Array<{ field: string; resolution: 'ours' | 'theirs' | 'manual'; value?: string }> (required)
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;

    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Merge ID is required', 400);
    }

    const mergeId = parseInt(id, 10);
    if (isNaN(mergeId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid merge ID', 400);
    }

    // Parse body
    const body = await request.json();
    const { resolutions } = body;

    if (!resolutions || !Array.isArray(resolutions)) {
      return errorResponse('VALIDATION_ERROR', 'Resolutions array is required', 400);
    }

    // Validate resolutions
    for (const resolution of resolutions) {
      if (!resolution.field || !resolution.resolution) {
        return errorResponse('VALIDATION_ERROR', 'Each resolution must have field and resolution', 400);
      }

      if (!['ours', 'theirs', 'manual'].includes(resolution.resolution)) {
        return errorResponse('VALIDATION_ERROR', 'Resolution must be "ours", "theirs", or "manual"', 400);
      }

      if (resolution.resolution === 'manual' && !resolution.value) {
        return errorResponse('VALIDATION_ERROR', 'Manual resolution must include value', 400);
      }
    }

    // Resolve conflicts
    await resolveMergeConflicts(mergeId, resolutions);

    return successResponse({
      success: true,
      message: 'Conflicts resolved and merge completed successfully'
    });
  } catch (error) {
    console.error('Error resolving conflicts:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Merge record not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to resolve conflicts',
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
