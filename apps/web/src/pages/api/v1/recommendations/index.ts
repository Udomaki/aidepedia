import type { APIRoute } from 'astro';
import { recommendationService } from '../../../../lib/recommendations';
import { 
  successResponse, 
  errorResponse, 
  handleCors,
} from '../../../../lib/api-utils';
import { getSession } from '../../../../lib/auth';

/**
 * GET /api/v1/recommendations
 * Get personalized recommendations for the current user
 * 
 * Query params:
 * - placement: homepage | sidebar | continue_reading (default: homepage)
 * - limit: Number of recommendations (default: 10, max: 20)
 * - articleId: Source article ID (for article-related recommendations)
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    // Get current user (optional - works for anonymous users too)
    const session = await getSession(request);
    const userId = session?.user?.id;

    // Get query params
    const placement = (url.searchParams.get('placement') || 'homepage') as 
      'homepage' | 'sidebar' | 'continue_reading';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 20);
    const sourceArticleId = url.searchParams.get('articleId');

    // Validate placement
    const validPlacements = ['homepage', 'sidebar', 'continue_reading'];
    if (!validPlacements.includes(placement)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid placement parameter', 400);
    }

    // Get visitor hash for anonymous users (from cookie or header)
    const visitorHash = request.headers.get('x-visitor-hash') || undefined;

    // Get recommendations
    const recommendations = await recommendationService.getPersonalizedFeed({
      userId,
      visitorHash,
      placement,
      limit,
      sourceArticleId: sourceArticleId ? parseInt(sourceArticleId) : undefined,
    });

    return successResponse({
      recommendations,
      meta: {
        placement,
        count: recommendations.length,
        algorithm: recommendations[0]?.algorithm || 'content_based',
      },
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch recommendations', 500);
  }
};

/**
 * POST /api/v1/recommendations/track
 * Track recommendation interactions
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    const body = await request.json();
    const { action, eventId, articleId, readTimeSeconds, scrollDepth, helpful } = body;

    switch (action) {
      case 'click':
        if (!eventId) {
          return errorResponse('VALIDATION_ERROR', 'eventId is required for click tracking', 400);
        }
        await recommendationService.trackRecommendationClick(eventId);
        break;

      case 'reading':
        const session = await getSession(request);
        if (!articleId) {
          return errorResponse('VALIDATION_ERROR', 'articleId is required for reading tracking', 400);
        }
        await recommendationService.trackReading({
          userId: session?.user?.id,
          articleId: parseInt(articleId),
          readTimeSeconds,
          scrollDepth,
        });
        break;

      case 'feedback':
        if (!eventId || helpful === undefined) {
          return errorResponse('VALIDATION_ERROR', 'eventId and helpful are required for feedback', 400);
        }
        await recommendationService.trackRecommendationFeedback(eventId, helpful);
        break;

      default:
        return errorResponse('VALIDATION_ERROR', 'Invalid action', 400);
    }

    return successResponse({ success: true });
  } catch (error) {
    console.error('Error tracking recommendation:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to track recommendation', 500);
  }
};
