import type { APIRoute } from 'astro';
import {
  createScheduledReport,
  listScheduledReports,
} from '@aidepedia/db';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../lib/api-utils';
import { getSession } from '../../../../lib/auth';
import { calculateNextRun } from '../../../../lib/dashboards';

/**
 * GET /api/v1/analytics/scheduled-reports
 * List user's scheduled reports
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const scheduled = await listScheduledReports(session.user.id);

    return successResponse(scheduled);
  } catch (error) {
    console.error('Error fetching scheduled reports:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch scheduled reports', 500);
  }
};

/**
 * POST /api/v1/analytics/scheduled-reports
 * Create a new scheduled report
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const body = await request.json();
    const { reportId, schedule, deliveryMethod, deliveryConfig } = body;

    if (!reportId || !schedule || !deliveryMethod) {
      return errorResponse('VALIDATION_ERROR', 'Report ID, schedule, and delivery method are required', 400);
    }

    const validSchedules = ['daily', 'weekly', 'monthly'];
    if (!validSchedules.includes(schedule)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid schedule', 400);
    }

    const validMethods = ['email', 'slack', 'webhook'];
    if (!validMethods.includes(deliveryMethod)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid delivery method', 400);
    }

    // Validate delivery config based on method
    if (deliveryMethod === 'email' && (!deliveryConfig.emails || deliveryConfig.emails.length === 0)) {
      return errorResponse('VALIDATION_ERROR', 'Email addresses required for email delivery', 400);
    }

    if (deliveryMethod === 'slack' && !deliveryConfig.slackWebhook) {
      return errorResponse('VALIDATION_ERROR', 'Slack webhook URL required for Slack delivery', 400);
    }

    if (deliveryMethod === 'webhook' && !deliveryConfig.webhookUrl) {
      return errorResponse('VALIDATION_ERROR', 'Webhook URL required for webhook delivery', 400);
    }

    const scheduled = await createScheduledReport({
      reportId,
      userId: session.user.id,
      schedule,
      nextRun: calculateNextRun(schedule),
      deliveryMethod,
      deliveryConfig,
    });

    return successResponse(scheduled, null, 201);
  } catch (error) {
    console.error('Error creating scheduled report:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create scheduled report', 500);
  }
};

/**
 * OPTIONS /api/v1/analytics/scheduled-reports
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = () => {
  return handleCors();
};
