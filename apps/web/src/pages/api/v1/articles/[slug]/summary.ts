/**
 * API endpoints for article summarization
 * GET /api/v1/articles/[slug]/summary - Get cached summary
 * POST /api/v1/articles/[slug]/summary - Generate new summary
 */

import type { APIRoute } from 'astro';
import { getArticleBySlug } from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';
import {
  getArticleSummary,
  getCachedSummary,
  deleteArticleSummary,
  isAnthropicConfigured,
} from '../../../../../lib/summarization';
import type { SummaryStyle } from '@aidepedia/db';

/**
 * GET /api/v1/articles/[slug]/summary
 * Get cached article summary
 */
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Only return summaries for published articles via public API
    if (article.status !== 'published') {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    // Get cached summary
    const summary = await getCachedSummary(article.id);

    if (!summary) {
      return errorResponse('NOT_FOUND', 'Summary not found', 404);
    }

    return successResponse({
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      style: summary.style,
      wordCount: summary.wordCount,
      generatedAt: summary.generatedAt?.toISOString?.() || summary.generatedAt,
      model: summary.model,
    });
  } catch (error) {
    console.error('Error fetching summary:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch summary',
      500
    );
  }
};

/**
 * POST /api/v1/articles/[slug]/summary
 * Generate new summary for an article
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
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
    const article = await getArticleBySlug(slug);

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
    const summary = await getArticleSummary(article.id, style, force);

    return successResponse({
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
 * DELETE /api/v1/articles/[slug]/summary
 * Delete cached summary (requires authentication)
 */
export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Get article
    const article = await getArticleBySlug(slug);

    // Delete summary
    await deleteArticleSummary(article.id);

    return successResponse({ deleted: true });
  } catch (error) {
    console.error('Error deleting summary:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to delete summary',
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
