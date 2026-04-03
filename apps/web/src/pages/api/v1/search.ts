import type { APIRoute } from 'astro';
import { 
  listArticles, 
  getCategories,
  getCategoryBySlug
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  getPaginationParams,
  transformArticleForApi
} from '../../../lib/api-utils';

/**
 * GET /api/v1/search
 * Search articles by query with enhanced relevance and faceted filtering
 * 
 * Query params:
 * - q: Search query (required)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - category: Filter by category slug
 * - author: Filter by author ID
 * - dateFrom: Filter by date (ISO string or 'today', 'week', 'month', 'year')
 * - dateTo: Filter by date (ISO string)
 * - minQuality: Minimum quality score (0-100)
 * - maxQuality: Maximum quality score (0-100)
 * - sortBy: Sort by 'relevance' (default), 'date', 'quality', 'popularity'
 * 
 * Enhanced relevance scoring:
 * - Boosts by quality score
 * - Boosts by recency
 * - Boosts by popularity (view count)
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const query = url.searchParams.get('q');
    
    if (!query || query.trim().length === 0) {
      return errorResponse('VALIDATION_ERROR', 'Search query (q) is required', 400);
    }

    const { page, limit } = getPaginationParams(url);
    const categorySlug = url.searchParams.get('category');
    const authorId = url.searchParams.get('author');
    const dateFrom = url.searchParams.get('dateFrom') || url.searchParams.get('date');
    const dateTo = url.searchParams.get('dateTo');
    const minQuality = url.searchParams.get('minQuality');
    const maxQuality = url.searchParams.get('maxQuality');
    const sortBy = url.searchParams.get('sortBy') || 'relevance';

    // Build query params
    const params: any = {
      status: 'published',
      search: query.trim(),
      page,
      limit,
      sortBy: sortBy === 'relevance' ? 'quality' : sortBy,
      sortOrder: 'desc',
    };

    // Handle category filter (by slug)
    if (categorySlug) {
      try {
        const category = await getCategoryBySlug(categorySlug);
        params.categoryId = category.id;
      } catch (error) {
        // Category not found, return empty results
        return successResponse({
          query: query.trim(),
          results: [],
          facets: await buildFacets(params),
        }, {
          total: 0,
          page,
          limit,
          totalPages: 0,
        });
      }
    }

    // Handle author filter
    if (authorId) {
      params.authorId = parseInt(authorId, 10);
    }

    // Handle quality score range filter
    if (minQuality) {
      params.minQualityScore = parseInt(minQuality, 10);
    }
    if (maxQuality) {
      params.maxQualityScore = parseInt(maxQuality, 10);
    }

    // Handle date filter
    if (dateFrom) {
      const now = new Date();
      let fromDate: Date | undefined;
      
      switch (dateFrom) {
        case 'today':
          fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          fromDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case 'year':
          fromDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          // Try to parse as ISO date
          fromDate = new Date(dateFrom);
          if (isNaN(fromDate.getTime())) {
            fromDate = undefined;
          }
      }
      
      if (fromDate) {
        params.dateFrom = fromDate.toISOString();
      }
    }

    if (dateTo) {
      params.dateTo = new Date(dateTo).toISOString();
    }

    // Search articles
    const result = await listArticles(params);

    // Fetch categories for lookup
    const categories = await getCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    // Transform articles for API and calculate enhanced relevance scores
    let articles = result.data.map(article => {
      const transformed = transformArticleForApi(
        article, 
        article.categoryId ? categoryMap.get(article.categoryId) : undefined
      );
      
      // Add enhanced relevance score
      (transformed as any).relevanceScore = calculateRelevanceScore(
        article,
        query.trim(),
        sortBy === 'relevance'
      );
      
      return transformed;
    });

    // Sort by enhanced relevance if requested
    if (sortBy === 'relevance') {
      articles.sort((a, b) => ((b as any).relevanceScore - (a as any).relevanceScore));
    }

    // Build facets for filtering
    const facets = await buildFacets(params);

    return successResponse({
      query: query.trim(),
      results: articles,
      facets,
    }, {
      total: result.meta.total,
      page: result.meta.page,
      limit: result.meta.limit,
      totalPages: result.meta.totalPages,
    });
  } catch (error) {
    console.error('Error searching articles:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to search articles',
      500
    );
  }
};

/**
 * Calculate enhanced relevance score for an article
 * Combines quality score, recency, and popularity
 */
function calculateRelevanceScore(
  article: any,
  query: string,
  useBoosts: boolean
): number {
  if (!useBoosts) {
    return article.qualityScore || 0;
  }

  let score = 50; // Base score

  // Boost by quality score (0-100 -> 0-30 points)
  const qualityBoost = (article.qualityScore || 0) * 0.3;
  score += qualityBoost;

  // Boost by recency (newer articles get more points)
  const daysSincePublication = article.publishedAt
    ? (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60 * 24)
    : 365;
  const recencyBoost = Math.max(0, 20 - (daysSincePublication / 365 * 20));
  score += recencyBoost;

  // Boost by popularity (view count)
  const viewCount = article.viewCount || 0;
  const popularityBoost = Math.min(20, viewCount / 100);
  score += popularityBoost;

  // Exact title match bonus
  if (article.title.toLowerCase().includes(query.toLowerCase())) {
    score += 10;
  }

  return Math.min(100, Math.round(score));
}

/**
 * Build facets for filtering
 */
async function buildFacets(params: any): Promise<any> {
  try {
    // Get categories with counts
    const categories = await getCategories();
    
    // For now, return basic facets
    // In a production system, you'd query actual counts
    return {
      categories: categories.map(cat => ({
        slug: cat.slug,
        name: cat.name,
        count: 0 // Would need separate query to get actual counts
      })),
      qualityRanges: [
        { label: 'All', min: 0, max: 100 },
        { label: 'High (70+)', min: 70, max: 100 },
        { label: 'Medium (40-69)', min: 40, max: 69 },
        { label: 'Low (0-39)', min: 0, max: 39 }
      ],
      dateRanges: [
        { label: 'Any Time', value: '' },
        { label: 'Today', value: 'today' },
        { label: 'This Week', value: 'week' },
        { label: 'This Month', value: 'month' },
        { label: 'This Year', value: 'year' }
      ]
    };
  } catch (error) {
    console.error('Error building facets:', error);
    return {};
  }
}

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
