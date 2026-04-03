import type { APIRoute } from 'astro';
import { recommendationService } from '../../../../../../lib/recommendations';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
} from '../../../../../../lib/api-utils';
import { getSession } from '../../../../../../lib/auth';
import { db } from '@aidepedia/db';
import { articles } from '@aidepedia/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/v1/recommendations/similar/:slug
 * Get articles similar to the specified article
 * 
 * Query params:
 * - limit: Number of recommendations (default: 5, max: 10)
 */
export const GET: APIRoute = async ({ params, url, request }) => {
  try {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    const { slug } = params;

    // Get article ID from slug
    const article = await db()
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1)
      .then(rows => rows[0]);

    if (!article) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    // Get current user (optional)
    const session = await getSession(request);
    const userId = session?.user?.id;

    // Get query params
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '5'), 10);

    // Get visitor hash for anonymous users
    const visitorHash = request.headers.get('x-visitor-hash') || undefined;

    // Get similar articles
    const similarArticles = await recommendationService.getSimilarArticles(article.id, {
      userId,
      visitorHash,
      limit,
    });

    return successResponse({
      articleId: article.id,
      slug,
      similarArticles,
      meta: {
        count: similarArticles.length,
        algorithm: similarArticles[0]?.algorithm || 'content_based',
      },
    });
  } catch (error) {
    console.error('Error fetching similar articles:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch similar articles', 500);
  }
};
