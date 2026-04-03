import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import {
  findContentGaps,
  suggestArticleIdeas,
  getContentGapSummary,
} from '../../../../lib/analytics/gap-analysis-service';
import { successResponse, errorResponse } from '../../../../lib/api-utils';

/**
 * GET /api/v1/analytics/gaps
 * Get content gap analysis (admin only)
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
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    const result: any = {};

    if (type === 'all' || type === 'gaps') {
      result.contentGaps = await findContentGaps(days, limit);
    }

    if (type === 'all' || type === 'suggestions') {
      result.articleSuggestions = await suggestArticleIdeas(days, limit);
    }

    if (type === 'all' || type === 'summary') {
      result.summary = await getContentGapSummary(days);
    }

    return successResponse(result);
  } catch (error) {
    console.error('Content gap API error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch content gaps', 500);
  }
};
