import type { APIRoute } from 'astro';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../lib/api-utils';

/**
 * GET /api/v1/search-history
 * Get recent search history from cookie/local storage
 * 
 * Note: This is a placeholder for server-side search history
 * In a real implementation, this would be stored in a database
 * For now, we'll manage it client-side in localStorage
 */
export const GET: APIRoute = async ({ cookies }) => {
  try {
    // Get search history from cookie or return empty
    const historyCookie = cookies.get('searchHistory');
    const history = historyCookie ? JSON.parse(historyCookie) : [];
    
    return successResponse({
      searches: history
    });
  } catch (error) {
    console.error('Error getting search history:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to get search history',
      500
    );
  }
};

/**
 * DELETE /api/v1/search-history
 * Clear search history
 */
export const DELETE: APIRoute = async ({ cookies }) => {
  try {
    // Clear the search history cookie
    cookies.delete('searchHistory', {
      path: '/'
    });
    
    return successResponse({
      message: 'Search history cleared'
    });
  } catch (error) {
    console.error('Error clearing search history:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to clear search history',
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
