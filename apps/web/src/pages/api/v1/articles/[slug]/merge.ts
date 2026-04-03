import type { APIRoute } from 'astro';
import { 
  getArticleBySlug,
  getBranch,
  mergeBranches,
  resolveMergeConflicts
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../../../lib/api-utils';

/**
 * POST /api/v1/articles/[slug]/merge
 * Merge two branches
 * 
 * Body:
 * - sourceBranchId: number (required)
 * - targetBranchId: number (required)
 * - mergeMessage: string (optional)
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Parse body
    const body = await request.json();
    const { sourceBranchId, targetBranchId, mergeMessage } = body;

    if (!sourceBranchId || !targetBranchId) {
      return errorResponse('VALIDATION_ERROR', 'Source and target branch IDs are required', 400);
    }

    // Verify branches exist and belong to this article
    const sourceBranch = await getBranch(sourceBranchId);
    const targetBranch = await getBranch(targetBranchId);

    if (!sourceBranch || !targetBranch) {
      return errorResponse('NOT_FOUND', 'Source or target branch not found', 404);
    }

    if (sourceBranch.articleId !== article.id || targetBranch.articleId !== article.id) {
      return errorResponse('VALIDATION_ERROR', 'Branches do not belong to this article', 400);
    }

    // Perform merge
    const result = await mergeBranches({
      articleId: article.id,
      sourceBranchId,
      targetBranchId,
      mergeMessage,
      // TODO: Get user ID from auth context
    });

    if (result.hasConflicts) {
      return successResponse({
        success: false,
        hasConflicts: true,
        conflicts: result.conflicts,
        mergeId: result.mergeId,
        message: 'Merge conflicts detected. Please resolve conflicts before completing merge.'
      }, 409);
    }

    return successResponse({
      success: true,
      hasConflicts: false,
      mergeId: result.mergeId,
      message: 'Merge completed successfully'
    });
  } catch (error) {
    console.error('Error merging branches:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to merge branches',
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
