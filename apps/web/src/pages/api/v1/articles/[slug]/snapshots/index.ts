import type { APIRoute } from 'astro';
import { 
  getArticleBySlug,
  createSnapshot,
  getSnapshots
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]/snapshots
 * Get all snapshots for an article
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Fetch snapshots
    const snapshots = await getSnapshots(article.id);

    // Transform for API
    const snapshotsData = snapshots.map(snapshot => ({
      id: snapshot.id,
      revisionId: snapshot.revisionId,
      snapshotType: snapshot.snapshotType,
      createdBy: snapshot.createdBy,
      createdAt: snapshot.createdAt?.toISOString(),
      data: snapshot.snapshotData
    }));

    return successResponse({
      snapshots: snapshotsData,
    });
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch snapshots',
      500
    );
  }
};

/**
 * POST /api/v1/articles/[slug]/snapshots
 * Create a new snapshot
 * 
 * Body:
 * - revisionId: number (required)
 * - snapshotType: 'auto' | 'manual' | 'pre_merge' | 'post_merge' (optional, default: 'manual')
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
    const { revisionId, snapshotType = 'manual' } = body;

    if (!revisionId) {
      return errorResponse('VALIDATION_ERROR', 'Revision ID is required', 400);
    }

    // Create snapshot
    const snapshot = await createSnapshot({
      articleId: article.id,
      revisionId,
      snapshotType,
      // TODO: Get user ID from auth context
    });

    return successResponse({
      snapshot: {
        id: snapshot.id,
        revisionId: snapshot.revisionId,
        snapshotType: snapshot.snapshotType,
        createdBy: snapshot.createdBy,
        createdAt: snapshot.createdAt?.toISOString(),
      }
    }, 201);
  } catch (error) {
    console.error('Error creating snapshot:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article or revision not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to create snapshot',
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
