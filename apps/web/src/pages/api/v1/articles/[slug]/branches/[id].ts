import type { APIRoute } from 'astro';
import { 
  getArticleBySlug,
  getBranch,
  abandonBranch,
  getBranchCommits
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]/branches/[id]
 * Get a specific branch with its commits
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug, id } = params;

    if (!slug || !id) {
      return errorResponse('VALIDATION_ERROR', 'Slug and branch ID are required', 400);
    }

    const branchId = parseInt(id, 10);
    if (isNaN(branchId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid branch ID', 400);
    }

    // Fetch article to verify it exists
    await getArticleBySlug(slug);

    // Fetch branch
    const branch = await getBranch(branchId);

    if (!branch) {
      return errorResponse('NOT_FOUND', 'Branch not found', 404);
    }

    // Fetch commits
    const commits = await getBranchCommits(branchId);

    // Transform for API
    const branchData = {
      id: branch.id,
      name: branch.name,
      description: branch.description,
      status: branch.status,
      createdBy: branch.createdBy,
      headRevisionId: branch.headRevisionId,
      parentBranchId: branch.parentBranchId,
      createdAt: branch.createdAt?.toISOString(),
      updatedAt: branch.updatedAt?.toISOString(),
      mergedAt: branch.mergedAt?.toISOString(),
      abandonedAt: branch.abandonedAt?.toISOString(),
      commits: commits.map(commit => ({
        id: commit.id,
        revisionId: commit.revisionId,
        commitMessage: commit.commitMessage,
        createdBy: commit.createdBy,
        createdAt: commit.createdAt?.toISOString(),
      }))
    };

    return successResponse({ branch: branchData });
  } catch (error) {
    console.error('Error fetching branch:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch branch',
      500
    );
  }
};

/**
 * PATCH /api/v1/articles/[slug]/branches/[id]
 * Update branch status (e.g., abandon)
 * 
 * Body:
 * - action: 'abandon' (required)
 */
export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const { slug, id } = params;

    if (!slug || !id) {
      return errorResponse('VALIDATION_ERROR', 'Slug and branch ID are required', 400);
    }

    const branchId = parseInt(id, 10);
    if (isNaN(branchId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid branch ID', 400);
    }

    // Fetch article to verify it exists
    await getArticleBySlug(slug);

    // Parse body
    const body = await request.json();
    const { action } = body;

    if (action === 'abandon') {
      await abandonBranch(branchId);
      
      return successResponse({ 
        message: 'Branch abandoned successfully',
        branchId 
      });
    }

    return errorResponse('VALIDATION_ERROR', 'Invalid action', 400);
  } catch (error) {
    console.error('Error updating branch:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article or branch not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to update branch',
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
