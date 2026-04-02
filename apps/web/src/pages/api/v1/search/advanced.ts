import type { APIRoute } from 'astro';
import { advancedSearch, getCategories, getCategoryBySlug } from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
  getPaginationParams,
  transformArticleForApi
} from '../../../../lib/api-utils';

/**
 * GET /api/v1/search/advanced
 * Advanced search with full-text search, faceted filtering, and relevance ranking
 * 
 * Query params:
 * - q: Search query (required for text search)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20, max: 100)
 * 
 * Faceted Filters:
 * - category: Filter by category slug
 * - authorId: Filter by author ID
 * - tags: Comma-separated list of tags
 * 
 * Date Filters:
 * - dateFrom: Start date (ISO string or 'today', 'week', 'month', 'year')
 * - dateTo: End date (ISO string)
 * 
 * Advanced Filters:
 * - articleLength: 'short' (1-3 min), 'medium' (4-10 min), 'long' (11+ min)
 * - minReadingTime: Minimum reading time in minutes
 * - maxReadingTime: Maximum reading time in minutes
 * - minVotes: Minimum net votes
 * - maxVotes: Maximum net votes
 * - voteFilter: 'highly_voted', 'controversial', 'new'
 * 
 * Search Options:
 * - useFTS: Use full-text search (default: true)
 * - sortBy: 'relevance' (default), 'date', 'votes', 'quality'
 * - sortOrder: 'desc' (default), 'asc'
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const query = url.searchParams.get('q') || '';
    const { page, limit } = getPaginationParams(url);
    
    // Build search params
    const searchParams: any = {
      page,
      limit,
      status: 'published',
      search: query,
      useFTS: url.searchParams.get('useFTS') !== 'false',
    };

    // Category filter
    const categorySlug = url.searchParams.get('category');
    if (categorySlug) {
      try {
        const category = await getCategoryBySlug(categorySlug);
        searchParams.categoryId = category.id;
      } catch (error) {
        // Category not found, return empty results
        return successResponse({
          query: query.trim(),
          results: [],
          facets: await buildFacets(),
        }, {
          total: 0,
          page,
          limit,
          totalPages: 0,
        });
      }
    }

    // Author filter
    const authorId = url.searchParams.get('authorId');
    if (authorId) {
      searchParams.authorId = parseInt(authorId, 10);
    }

    // Tags filter
    const tagsParam = url.searchParams.get('tags');
    if (tagsParam) {
      searchParams.tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
    }

    // Date filters
    const dateFrom = url.searchParams.get('dateFrom');
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
          fromDate = new Date(dateFrom);
          if (isNaN(fromDate.getTime())) {
            fromDate = undefined;
          }
      }
      
      if (fromDate) {
        searchParams.dateFrom = fromDate.toISOString();
      }
    }

    const dateTo = url.searchParams.get('dateTo');
    if (dateTo) {
      const toDate = new Date(dateTo);
      if (!isNaN(toDate.getTime())) {
        searchParams.dateTo = toDate.toISOString();
      }
    }

    // Article length filter
    const articleLength = url.searchParams.get('articleLength');
    if (articleLength && ['short', 'medium', 'long'].includes(articleLength)) {
      searchParams.articleLength = articleLength;
    }

    // Reading time filters
    const minReadingTime = url.searchParams.get('minReadingTime');
    if (minReadingTime) {
      searchParams.minReadingTime = parseInt(minReadingTime, 10);
    }

    const maxReadingTime = url.searchParams.get('maxReadingTime');
    if (maxReadingTime) {
      searchParams.maxReadingTime = parseInt(maxReadingTime, 10);
    }

    // Vote filters
    const minVotes = url.searchParams.get('minVotes');
    if (minVotes) {
      searchParams.minVotes = parseInt(minVotes, 10);
    }

    const maxVotes = url.searchParams.get('maxVotes');
    if (maxVotes) {
      searchParams.maxVotes = parseInt(maxVotes, 10);
    }

    const voteFilter = url.searchParams.get('voteFilter');
    if (voteFilter && ['highly_voted', 'controversial', 'new'].includes(voteFilter)) {
      searchParams.voteFilter = voteFilter;
    }

    // Perform search
    const result = await advancedSearch(searchParams);

    // Fetch categories for lookup
    const categories = await getCategories();
    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    // Transform articles for API
    const articles = result.data.map(article => {
      const transformed = transformArticleForApi(
        article, 
        article.categoryId ? categoryMap.get(article.categoryId) : undefined
      );
      
      // Add search metadata
      return {
        ...transformed,
        relevanceScore: (article as any).relevanceScore,
        highlightedTitle: (article as any).highlightedTitle,
        highlightedContent: (article as any).highlightedContent,
      };
    });

    // Build facets for filtering
    const facets = await buildFacets();

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
    console.error('Error in advanced search:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to perform search',
      500
    );
  }
};

/**
 * Build facets for filtering UI
 */
async function buildFacets() {
  const categories = await getCategories();
  
  return {
    categories: categories.map(c => ({
      slug: c.slug,
      name: c.name,
      count: c.articleCount || 0,
    })),
    articleLengths: [
      { value: 'short', label: 'Short (1-3 min)', min: 1, max: 3 },
      { value: 'medium', label: 'Medium (4-10 min)', min: 4, max: 10 },
      { value: 'long', label: 'Long (11+ min)', min: 11, max: 999 },
    ],
    voteFilters: [
      { value: 'highly_voted', label: 'Highly Voted (10+ votes)' },
      { value: 'controversial', label: 'Controversial (many up & down votes)' },
      { value: 'new', label: 'New (this week)' },
    ],
    dateRanges: [
      { value: 'today', label: 'Today' },
      { value: 'week', label: 'This Week' },
      { value: 'month', label: 'This Month' },
      { value: 'year', label: 'This Year' },
    ],
  };
}

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
