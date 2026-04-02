import type { APIRoute } from 'astro';
import { 
  createSavedSearch, 
  getSavedSearches, 
  getSavedSearchById,
  updateSavedSearch,
  deleteSavedSearch 
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  getPaginationParams 
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/search/saved
 * Get user's saved searches
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const userId = (session.user as any).id;
    const { page, limit } = getPaginationParams(url);

    const result = await getSavedSearches(userId, { page, limit });

    return successResponse(result.data, result.meta);
  } catch (error) {
    console.error('Error fetching saved searches:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch saved searches',
      500
    );
  }
};

/**
 * POST /api/v1/search/saved
 * Create a new saved search
 * 
 * Body:
 * - name: Name for the saved search (required)
 * - query: Search query (required)
 * - filters: Filter options (optional)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const userId = (session.user as any).id;
    const body = await request.json();

    if (!body.name || !body.query) {
      return errorResponse('VALIDATION_ERROR', 'Name and query are required', 400);
    }

    const savedSearch = await createSavedSearch({
      userId,
      name: body.name,
      query: body.query,
      filters: body.filters,
    });

    return successResponse(savedSearch, undefined, 201);
  } catch (error) {
    console.error('Error creating saved search:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to create saved search',
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
