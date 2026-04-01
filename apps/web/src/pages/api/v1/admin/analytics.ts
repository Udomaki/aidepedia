import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { 
  getTrafficStats, 
  getTopArticlesByViews, 
  getTrafficSources, 
  getGeographicDistribution,
  getAnalyticsSummary 
} from '@aidepedia/db/queries';
import { successResponse, errorResponse } from '../../../../lib/api-utils';

/**
 * GET /api/v1/admin/analytics
 * Get analytics data (admin only)
 */
export const GET: APIRoute = async ({ request, url }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    // Get query parameters
    const days = parseInt(url.searchParams.get('days') || '7', 10);
    const validDays = [7, 30, 90].includes(days) ? days : 7;

    // Fetch all analytics data in parallel
    const [summary, traffic, topArticles, sources, geo] = await Promise.all([
      getAnalyticsSummary(validDays),
      getTrafficStats(validDays),
      getTopArticlesByViews(validDays, 10),
      getTrafficSources(validDays, 10),
      getGeographicDistribution(validDays, 10),
    ]);

    return successResponse({
      summary,
      traffic,
      topArticles,
      sources,
      geo,
      period: {
        days: validDays,
        startDate: new Date(Date.now() - validDays * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Analytics API error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch analytics', 500);
  }
};
