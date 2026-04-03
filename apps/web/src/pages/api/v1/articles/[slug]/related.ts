import type { APIRoute } from 'astro';
import { 
  getArticleBySlug,
  findRelatedArticles,
  getCategories,
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  transformArticleForApi
} from '../../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]/related
 * Get related articles based on semantic similarity
 * 
 * Query params:
 * - limit: Number of related articles (default: 5, max: 20)
 */
export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { slug } = params;
    
    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Article slug is required', 400);
    }

    // Get limit from query params
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 20) : 5;

    // Validate limit
    if (isNaN(limit) || limit < 1) {
      return errorResponse('VALIDATION_ERROR', 'Invalid limit parameter', 400);
    }

    // Fetch the article
    const article = await getArticleBySlug(slug);

    // Find related articles
    const relatedArticles = await findRelatedArticles(article.id, {
      limit,
      threshold: 0.75,
    });

    // Fetch categories for lookup
    const categories = await getCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    // Transform articles for API
    const transformedArticles = relatedArticles.map(rel => ({
      id: rel.articleId,
      title: rel.title,
      slug: rel.slug,
      excerpt: rel.excerpt,
      similarity: rel.similarity,
    }));

    return successResponse({
      article: {
        id: article.id,
        title: article.title,
        slug: article.slug,
      },
      related: transformedArticles,
    });
  } catch (error) {
    console.error('Error fetching related articles:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch related articles',
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
