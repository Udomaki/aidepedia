import type { APIRoute } from 'astro';
import { getSession } from '../../../../../../lib/auth';
import { db } from '@aidepedia/db';
import { webhook_deliveries } from '@aidepedia/db/schema';
import { successResponse, errorResponse, getPaginationParams } from '../../../../../../lib/api-utils';
import { desc, eq } from '@aidepedia/db';

/**
 * GET /api/v1/admin/webhooks/[id]/deliveries
 * Get delivery history for a webhook (admin only)
 */
export const GET: APIRoute = async ({ request, params, url }) => {
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

    const { page, limit, offset } = getPaginationParams(url);

    // Get deliveries
    const deliveries = await db
      .select()
      .from(webhook_deliveries)
      .where(eq(webhook_deliveries.webhookId, webhookId))
      .orderBy(desc(webhook_deliveries.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const allDeliveries = await db
      .select()
      .from(webhook_deliveries)
      .where(eq(webhook_deliveries.webhookId, webhookId));

    return successResponse(deliveries, {
      total: allDeliveries.length,
      page,
      limit,
      totalPages: Math.ceil(allDeliveries.length / limit),
    });
  } catch (error) {
    console.error('Get webhook deliveries error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get webhook deliveries', 500);
  }
};

/**
 * OPTIONS /api/v1/admin/webhooks/[id]/deliveries
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};
