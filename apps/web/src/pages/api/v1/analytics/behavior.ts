import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import {
  analyzeEngagementPatterns,
  identifyUserSegments,
  getTopUserJourneys,
} from '../../../../lib/analytics/behavior-service';
import { successResponse, errorResponse } from '../../../../lib/api-utils';

/**
 * GET /api/v1/analytics/behavior
 * Get user behavior analytics (admin only)
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
    const limit = parseInt(url.searchParams.get('limit') || '10', 10);

    const result: any = {};

    if (type === 'all' || type === 'patterns') {
      result.engagementPatterns = await analyzeEngagementPatterns(days);
    }

    if (type === 'all' || type === 'segments') {
      result.userSegments = await identifyUserSegments(days);
    }

    if (type === 'all' || type === 'journeys') {
      result.topJourneys = await getTopUserJourneys(days, limit);
    }

    return successResponse(result);
  } catch (error) {
    console.error('Behavior analytics API error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch behavior analytics', 500);
  }
};
