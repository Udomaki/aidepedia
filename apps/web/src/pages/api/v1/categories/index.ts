import type { APIRoute } from 'astro';
import { getCategories } from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  transformCategoryForApi
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/categories
 * List all categories
 * 
 * Returns all available categories with article counts
 */
export const GET: APIRoute = async () => {
  try {
    // Fetch all categories
    const categories = await getCategories();

    // Transform for API
    const categoryData = categories.map(transformCategoryForApi);

    return successResponse(categoryData, {
      total: categories.length,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch categories',
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
