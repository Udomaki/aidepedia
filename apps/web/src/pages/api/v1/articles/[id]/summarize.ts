/**
 * API endpoint for article summarization by ID
 * POST /api/v1/articles/[id]/summarize - Generate new summary
 */

import type { APIRoute } from 'astro';
import { getArticleById } from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';
import {
  getArticleSummary,
  isAnthropicConfigured,
} from '../../../../../lib/summarization';
import type { SummaryStyle } from '@aidepedia/db';

/**
 * POST /api/v1/articles/[id]/summarize
 * Generate new summary for an article by ID
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;

    if (!id) {
      return errorResponse('VALIDATION_ERROR', 'Article ID is required', 400);
    }

    const articleId = parseInt(id, 10);
    if (isNaN(articleId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid article ID', 400);
    }

    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Check if Anthropic API is configured
    if (!isAnthropicConfigured()) {
      return errorResponse(
        'SERVICE_UNAVAILABLE',
        'AI summarization service is not configured',
        503
      );
    }

    // Get article
    const article = await getArticleById(articleId);

    // Parse request body
    const body = await request.json();
    const { style = 'detailed', force = false } = body;

    // Validate style
    const validStyles: SummaryStyle[] = ['brief', 'detailed', 'bullets'];
    if (!validStyles.includes(style)) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Invalid style. Must be one of: brief, detailed, bullets',
        400
      );
    }

    // Generate summary
    const summary = await getArticleSummary(articleId, style, force);

    return successResponse({
      articleId,
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      style,
      model: summary.model,
    });
  } catch (error) {
    console.error('Error generating summary:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to generate summary',
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
