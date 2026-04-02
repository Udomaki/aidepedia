import type { APIRoute } from 'astro';
import { 
  getSavedSearchById,
  updateSavedSearch,
  deleteSavedSearch 
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/search/saved/[id]
 * Get a specific saved search
 */
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const userId = (session.user as any).id;
    const searchId = parseInt(params.id, 10);

    if (isNaN(searchId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid search ID', 400);
    }

    const savedSearch = await getSavedSearchById(searchId, userId);

    return successResponse(savedSearch);
  } catch (error: any) {
    console.error('Error fetching saved search:', error);
    
    if (error.message?.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Saved search not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch saved search',
      500
    );
  }
};

/**
 * PUT /api/v1/search/saved/[id]
 * Update a saved search
 * 
 * Body:
 * - name: New name for the saved search (optional)
 * - query: New search query (optional)
 * - filters: New filter options (optional)
 */
export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const userId = (session.user as any).id;
    const searchId = parseInt(params.id, 10);

    if (isNaN(searchId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid search ID', 400);
    }

    const body = await request.json();

    const updated = await updateSavedSearch(searchId, userId, {
      name: body.name,
      query: body.query,
      filters: body.filters,
    });

    return successResponse(updated);
  } catch (error: any) {
    console.error('Error updating saved search:', error);
    
    if (error.message?.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Saved search not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to update saved search',
      500
    );
  }
};

/**
 * DELETE /api/v1/search/saved/[id]
 * Delete a saved search
 */
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const userId = (session.user as any).id;
    const searchId = parseInt(params.id, 10);

    if (isNaN(searchId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid search ID', 400);
    }

    await deleteSavedSearch(searchId, userId);

    return successResponse({ deleted: true });
  } catch (error: any) {
    console.error('Error deleting saved search:', error);
    
    if (error.message?.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Saved search not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to delete saved search',
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
