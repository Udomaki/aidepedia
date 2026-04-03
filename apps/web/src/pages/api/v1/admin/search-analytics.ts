import type { APIRoute } from 'astro';
import { db, sql, desc, count, gte } from '@aidepedia/db';
import { search_analytics } from '@aidepedia/db/schema';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/admin/search-analytics
 * Get search analytics and insights
 * 
 * Query params:
 * - period: Time period ('day', 'week', 'month', 'all') - default: 'week'
 * - limit: Number of top queries to return - default: 20
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const period = url.searchParams.get('period') || 'week';
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    // Calculate date filter
    const now = new Date();
    let dateFrom: Date;
    
    switch (period) {
      case 'day':
        dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFrom = new Date(now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), now.getMonth() === 0 ? 11 : now.getMonth() - 1, now.getDate());
        break;
      case 'all':
        dateFrom = new Date(0); // Beginning of time
        break;
      default:
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get popular searches
    const popularSearches = await db
      .select({
        query: search_analytics.query,
        count: count(),
        avgResults: sql<number>`AVG(${search_analytics.resultsCount})`,
        successRate: sql<number>`AVG(CASE WHEN ${search_analytics.hasResults} THEN 1 ELSE 0 END) * 100`,
      })
      .from(search_analytics)
      .where(gte(search_analytics.createdAt, dateFrom))
      .groupBy(search_analytics.query)
      .orderBy(desc(count()))
      .limit(limit);

    // Get zero-result searches
    const zeroResultSearches = await db
      .select({
        query: search_analytics.query,
        count: count(),
      })
      .from(search_analytics)
      .where(gte(search_analytics.createdAt, dateFrom))
      .where(sql`${search_analytics.hasResults} = false`)
      .groupBy(search_analytics.query)
      .orderBy(desc(count()))
      .limit(limit);

    // Get search type distribution
    const searchTypeStats = await db
      .select({
        searchType: search_analytics.searchType,
        count: count(),
        avgResults: sql<number>`AVG(${search_analytics.resultsCount})`,
        avgResponseTime: sql<number>`AVG(${search_analytics.responseTimeMs})`,
      })
      .from(search_analytics)
      .where(gte(search_analytics.createdAt, dateFrom))
      .groupBy(search_analytics.searchType);

    // Get overall stats
    const [overallStats] = await db
      .select({
        totalSearches: count(),
        uniqueQueries: sql<number>`COUNT(DISTINCT ${search_analytics.query})`,
        avgResults: sql<number>`AVG(${search_analytics.resultsCount})`,
        successRate: sql<number>`AVG(CASE WHEN ${search_analytics.hasResults} THEN 1 ELSE 0 END) * 100`,
        avgResponseTime: sql<number>`AVG(${search_analytics.responseTimeMs})`,
      })
      .from(search_analytics)
      .where(gte(search_analytics.createdAt, dateFrom));

    // Get recent searches (last 50)
    const recentSearches = await db
      .select({
        query: search_analytics.query,
        searchType: search_analytics.searchType,
        resultsCount: search_analytics.resultsCount,
        responseTimeMs: search_analytics.responseTimeMs,
        createdAt: search_analytics.createdAt,
      })
      .from(search_analytics)
      .where(gte(search_analytics.createdAt, dateFrom))
      .orderBy(desc(search_analytics.createdAt))
      .limit(50);

    return successResponse({
      period,
      overall: {
        totalSearches: Number(overallStats.totalSearches),
        uniqueQueries: Number(overallStats.uniqueQueries),
        avgResults: Number(overallStats.avgResults || 0).toFixed(2),
        successRate: Number(overallStats.successRate || 0).toFixed(2),
        avgResponseTime: `${Number(overallStats.avgResponseTime || 0).toFixed(0)}ms`,
      },
      popularSearches: popularSearches.map(s => ({
        query: s.query,
        count: Number(s.count),
        avgResults: Number(s.avgResults || 0).toFixed(2),
        successRate: `${Number(s.successRate || 0).toFixed(2)}%`,
      })),
      zeroResultSearches: zeroResultSearches.map(s => ({
        query: s.query,
        count: Number(s.count),
      })),
      searchTypeDistribution: searchTypeStats.map(s => ({
        type: s.searchType,
        count: Number(s.count),
        avgResults: Number(s.avgResults || 0).toFixed(2),
        avgResponseTime: `${Number(s.avgResponseTime || 0).toFixed(0)}ms`,
      })),
      recentSearches: recentSearches.map(s => ({
        query: s.query,
        type: s.searchType,
        results: s.resultsCount,
        responseTime: `${s.responseTimeMs || 0}ms`,
        timestamp: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching search analytics:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch search analytics',
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
