import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { createContentReport, listContentReports } from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
  getPaginationParams,
} from '../../../../lib/api-utils';

/**
 * POST /api/v1/reports
 * Submit a new content report
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { contentType, contentId, reason, description } = body;

    // Validate content type
    if (!['article', 'comment'].includes(contentType)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid content type. Must be "article" or "comment"', 400);
    }

    // Validate reason
    const validReasons = ['spam', 'harassment', 'misinformation', 'inappropriate', 'copyright', 'other'];
    if (!validReasons.includes(reason)) {
      return errorResponse('VALIDATION_ERROR', `Invalid reason. Must be one of: ${validReasons.join(', ')}`, 400);
    }

    // Validate content ID
    if (!contentId || typeof contentId !== 'number') {
      return errorResponse('VALIDATION_ERROR', 'Content ID must be a number', 400);
    }

    const report = await createContentReport({
      reporterId: parseInt(session.user.id),
      contentType,
      contentId,
      reason,
      description: description || null,
    });

    return successResponse(report, undefined, 201);
  } catch (error) {
    console.error('Error creating report:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create report', 500);
  }
};

/**
 * OPTIONS for CORS
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
