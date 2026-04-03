import type { APIRoute } from 'astro';
import { 
  getArticleBySlug,
  createBranch,
  getBranchesByArticle,
  getBranchTree
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]/branches
 * Get all branches for an article
 * 
 * Query params:
 * - tree: boolean - Return as tree structure (default: false)
 */
export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Fetch article
    const article = await getArticleBySlug(slug);

    const asTree = url.searchParams.get('tree') === 'true';

    if (asTree) {
      const treeData = await getBranchTree(article.id);
      
      return successResponse({
        branches: treeData.branches.map(branch => ({
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
        })),
        tree: Object.fromEntries(treeData.tree)
      });
    }

    // Fetch branches
    const branches = await getBranchesByArticle(article.id);

    // Transform for API
    const branchesData = branches.map(branch => ({
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
    }));

    return successResponse({
      branches: branchesData,
    });
  } catch (error) {
    console.error('Error fetching branches:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch branches',
      500
    );
  }
};

/**
 * POST /api/v1/articles/[slug]/branches
 * Create a new branch
 * 
 * Body:
 * - name: string (required)
 * - description: string (optional)
 * - sourceRevisionId: number (optional)
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
    const { name, description, sourceRevisionId } = body;

    if (!name || typeof name !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'Branch name is required', 400);
    }

    // Create branch
    const branch = await createBranch({
      articleId: article.id,
      name,
      description,
      sourceRevisionId,
      // TODO: Get user ID from auth context
    });

    return successResponse({
      branch: {
        id: branch.id,
        name: branch.name,
        description: branch.description,
        status: branch.status,
        createdBy: branch.createdBy,
        headRevisionId: branch.headRevisionId,
        parentBranchId: branch.parentBranchId,
        createdAt: branch.createdAt?.toISOString(),
        updatedAt: branch.updatedAt?.toISOString(),
      }
    }, 201);
  } catch (error) {
    console.error('Error creating branch:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to create branch',
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
