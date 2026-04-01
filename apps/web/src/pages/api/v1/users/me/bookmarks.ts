import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { 
  getUserBookmarks,
  getCategories,
  NotFoundError
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors 
} from '../../../../../lib/api-utils';

/**
 * GET /api/v1/users/me/bookmarks
 * Get current user's bookmarked articles
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    // Parse pagination params
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');

    // Get bookmarks
    const result = await getUserBookmarks(
      parseInt(session.user.id as string),
      { page, limit }
    );

    // Fetch categories for lookup
    const categories = await getCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c]));

    // Transform articles for API
    const articles = result.data.map(article => {
      const categoryName = article.categoryId 
        ? categoryMap.get(article.categoryId)?.name 
        : undefined;

      return {
        id: article.id,
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        category: categoryName,
        tags: article.tags || [],
        status: article.status,
        qualityScore: article.qualityScore || 0,
        viewCount: article.viewCount || 0,
        upvotes: article.upvotes || 0,
        downvotes: article.downvotes || 0,
        netScore: (article.upvotes || 0) - (article.downvotes || 0),
        createdAt: article.createdAt?.toISOString?.() || article.createdAt,
        publishedAt: article.publishedAt?.toISOString?.() || article.publishedAt,
        bookmarkedAt: article.bookmarkedAt?.toISOString?.() || article.bookmarkedAt,
      };
    });

    return successResponse({
      articles,
      pagination: result.meta,
    });
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    
    if (error instanceof NotFoundError) {
      return errorResponse('NOT_FOUND', 'User not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch bookmarks',
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
