import type { APIRoute } from 'astro';
import { getSession } from '../../../../../../lib/auth';
import { db } from '@aidepedia/db';
import { webhooks } from '@aidepedia/db/schema';
import { successResponse, errorResponse } from '../../../../../../lib/api-utils';
import { testWebhook } from '../../../../../../lib/webhooks';
import { eq } from '@aidepedia/db';

/**
 * POST /api/v1/admin/webhooks/[id]/test
 * Test a webhook delivery (admin only)
 */
export const POST: APIRoute = async ({ request, params }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const webhookId = parseInt(params.id as string, 10);
    if (isNaN(webhookId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid webhook ID', 400);
    }

    // Check if webhook exists
    const [existing] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, webhookId))
      .limit(1);

    if (!existing) {
      return errorResponse('NOT_FOUND', 'Webhook not found', 404);
    }

    // Test webhook delivery
    const result = await testWebhook(webhookId);

    return successResponse({
      success: result.success,
      responseCode: result.responseCode,
      error: result.error,
    });
  } catch (error) {
    console.error('Test webhook error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to test webhook', 500);
  }
};

/**
 * OPTIONS /api/v1/admin/webhooks/[id]/test
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};
