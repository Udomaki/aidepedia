import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { 
  forecastArticleGrowth,
  predictTrendingTopics,
  estimateResourceNeeds,
  getArticlePredictions,
} from '../../../../lib/analytics/predictive-service';
import { successResponse, errorResponse } from '../../../../lib/api-utils';

/**
 * GET /api/v1/analytics/predictions
 * Get predictive analytics data (admin only)
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const type = url.searchParams.get('type') || 'all';
    const days = parseInt(url.searchParams.get('days') || '30', 10);
    const articleId = url.searchParams.get('articleId');
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    const result: any = {};

    if (type === 'all' || type === 'trending') {
      result.trendingTopics = await predictTrendingTopics(days, limit);
    }

    if (type === 'all' || type === 'resources') {
      result.resourceNeeds = await estimateResourceNeeds(days);
    }

    if (articleId && (type === 'all' || type === 'article')) {
      const id = parseInt(articleId, 10);
      if (!isNaN(id)) {
        result.articleGrowth = await forecastArticleGrowth(id, days);
      }
    }

    return successResponse(result);
  } catch (error) {
    console.error('Predictions API error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch predictions', 500);
  }
};
