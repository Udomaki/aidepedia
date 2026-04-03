import type { APIRoute } from 'astro';
import { 
  listArticles, 
  getCategories,
  getCategoryBySlug,
  semanticSearch,
  hybridSearch,
  db,
  sql,
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  getPaginationParams,
  transformArticleForApi
} from '../../../lib/api-utils';
import { search_analytics } from '@aidepedia/db/schema';

/**
 * GET /api/v1/search
 * Search articles by query with support for semantic search
 * 
 * Query params:
 * - q: Search query (required)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * - category: Filter by category slug
 * - dateFrom: Filter by date (ISO string or 'today', 'week', 'month', 'year')
 * - dateTo: Filter by date (ISO string)
 * - mode: Search mode - 'keyword', 'semantic', or 'hybrid' (default: 'hybrid')
 */
export const GET: APIRoute = async ({ url, request }) => {
  const startTime = Date.now();
  let searchQuery = '';
  let searchMode = 'hybrid';
  let hasResults = false;
  let resultsCount = 0;
  
  try {
    searchQuery = url.searchParams.get('q') || '';
    searchMode = url.searchParams.get('mode') || 'hybrid';
    
    if (!searchQuery || searchQuery.trim().length === 0) {
      return errorResponse('VALIDATION_ERROR', 'Search query (q) is required', 400);
    }

    // Validate search mode
    if (!['keyword', 'semantic', 'hybrid'].includes(searchMode)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid search mode. Use: keyword, semantic, or hybrid', 400);
    }

    const { page, limit } = getPaginationParams(url);
    const categorySlug = url.searchParams.get('category');
    const dateFilter = url.searchParams.get('dateFrom') || url.searchParams.get('date');

    let articles: any[] = [];
    let total = 0;

    // Get category ID if filtering by category
    let categoryId: number | undefined;
    if (categorySlug) {
      try {
        const category = await getCategoryBySlug(categorySlug);
        categoryId = category.id;
      } catch (error) {
        // Category not found, return empty results
        return successResponse({
          query: searchQuery.trim(),
          mode: searchMode,
          results: [],
        }, {
          total: 0,
          page,
          limit,
          totalPages: 0,
        });
      }
    }

    // Handle date filter
    let dateFrom: Date | undefined;
    if (dateFilter) {
      const now = new Date();
      
      switch (dateFilter) {
        case 'today':
          dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case 'year':
          dateFrom = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          dateFrom = new Date(dateFilter);
          if (isNaN(dateFrom.getTime())) {
            dateFrom = undefined;
          }
      }
    }

    // Perform search based on mode
    if (searchMode === 'semantic') {
      // Pure semantic search using embeddings
      try {
        const semanticResults = await semanticSearch(searchQuery.trim(), {
          limit,
          offset: (page - 1) * limit,
          threshold: 0.7,
        });

        // Fetch full article data
        if (semanticResults.length > 0) {
          const articleIds = semanticResults.map(r => r.articleId);
          const fullArticles = await listArticles({
            status: 'published',
            articleIds,
            limit,
          });

          // Merge semantic scores with article data
          articles = fullArticles.data.map(article => ({
            ...article,
            similarity: semanticResults.find(r => r.articleId === article.id)?.similarity || 0,
          }));
          total = fullArticles.meta.total;
        }
      } catch (error) {
        // If semantic search fails (e.g., no embeddings), fall back to keyword
        console.error('Semantic search failed, falling back to keyword:', error);
        searchMode = 'keyword';
      }
    }

    if (searchMode === 'hybrid') {
      // Hybrid search combining semantic and keyword
      try {
        const hybridResults = await hybridSearch(searchQuery.trim(), {
          limit,
          offset: (page - 1) * limit,
          semanticWeight: 0.7,
          keywordWeight: 0.3,
          categoryId,
        });

        // Fetch full article data
        if (hybridResults.length > 0) {
          const articleIds = hybridResults.map(r => r.articleId);
          const fullArticles = await listArticles({
            status: 'published',
            articleIds,
            limit,
          });

          // Merge scores with article data
          articles = fullArticles.data.map(article => {
            const result = hybridResults.find(r => r.articleId === article.id);
            return {
              ...article,
              semanticScore: result?.semanticScore || 0,
              keywordScore: result?.keywordScore || 0,
              combinedScore: result?.combinedScore || 0,
            };
          });
          total = hybridResults.length;
        }
      } catch (error) {
        // If hybrid search fails, fall back to keyword
        console.error('Hybrid search failed, falling back to keyword:', error);
        searchMode = 'keyword';
      }
    }

    if (searchMode === 'keyword') {
      // Traditional keyword search
      const params: any = {
        status: 'published',
        search: searchQuery.trim(),
        page,
        limit,
        sortBy: 'quality',
        sortOrder: 'desc',
      };

      if (categoryId) {
        params.categoryId = categoryId;
      }

      if (dateFrom) {
        params.dateFrom = dateFrom.toISOString();
      }

      const result = await listArticles(params);
      articles = result.data;
      total = result.meta.total;
    }

    // Fetch categories for lookup
    const categories = await getCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    // Transform articles for API
    const transformedArticles = articles.map(article => 
      transformArticleForApi(article, article.categoryId ? categoryMap.get(article.categoryId) : undefined)
    );

    hasResults = transformedArticles.length > 0;
    resultsCount = transformedArticles.length;

    // Track search analytics asynchronously (don't wait for it)
    trackSearchAnalytics({
      query: searchQuery.trim(),
      searchType: searchMode,
      resultsCount,
      hasResults,
      filters: {
        category: categorySlug || undefined,
        dateFrom: dateFilter || undefined,
      },
      responseTimeMs: Date.now() - startTime,
      request,
    }).catch(err => console.error('Failed to track search analytics:', err));

    return successResponse({
      query: searchQuery.trim(),
      mode: searchMode,
      results: transformedArticles,
    }, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error searching articles:', error);
    
    // Track failed search
    trackSearchAnalytics({
      query: searchQuery.trim(),
      searchType: searchMode,
      resultsCount: 0,
      hasResults: false,
      responseTimeMs: Date.now() - startTime,
      request,
      error: error instanceof Error ? error.message : 'Unknown error',
    }).catch(err => console.error('Failed to track search analytics:', err));

    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to search articles',
      500
    );
  }
};

/**
 * Track search analytics
 */
async function trackSearchAnalytics(params: {
  query: string;
  searchType: string;
  resultsCount: number;
  hasResults: boolean;
  filters?: any;
  responseTimeMs?: number;
  request?: Request;
  error?: string;
}): Promise<void> {
  try {
    // Get user ID from request if available (would need auth middleware)
    const userId = undefined; // TODO: Extract from auth context
    const sessionId = undefined; // TODO: Extract from session

    await db.insert(search_analytics).values({
      query: params.query,
      searchType: params.searchType as any,
      resultsCount: params.resultsCount,
      hasResults: params.hasResults,
      filters: params.filters,
      responseTimeMs: params.responseTimeMs,
      userId,
      sessionId,
    });
  } catch (error) {
    console.error('Error tracking search analytics:', error);
  }
}

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
