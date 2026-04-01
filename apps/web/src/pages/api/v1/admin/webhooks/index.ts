import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { db } from '@aidepedia/db';
import { webhooks } from '@aidepedia/db/schema';
import { successResponse, errorResponse } from '../../../../../lib/api-utils';
import { desc } from '@aidepedia/db';
import { logAuditEntry, AuditActions, ResourceTypes } from '../../../../../lib/audit';

/**
 * GET /api/v1/admin/webhooks
 * List all webhooks (admin only)
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const allWebhooks = await db
      .select()
      .from(webhooks)
      .orderBy(desc(webhooks.createdAt));

    return successResponse(allWebhooks);
  } catch (error) {
    console.error('List webhooks error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to list webhooks', 500);
  }
};

/**
 * POST /api/v1/admin/webhooks
 * Create a new webhook (admin only)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.email) {
      return errorResponse('UNAUTHORIZED', 'You must be logged in', 401);
    }

    const body = await request.json();
    const { url, secret, events, enabled = true } = body;

    // Validate required fields
    if (!url || typeof url !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'URL is required', 400);
    }

    if (!secret || typeof secret !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'Secret is required', 400);
    }

    if (!events || !Array.isArray(events) || events.length === 0) {
      return errorResponse('VALIDATION_ERROR', 'Events must be a non-empty array', 400);
    }

    // Validate events
    const validEvents = [
      'article.created',
      'article.updated',
      'article.deleted',
      'comment.created',
      'comment.deleted',
      'user.followed',
    ];

    const invalidEvents = events.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return errorResponse(
        'VALIDATION_ERROR',
        `Invalid events: ${invalidEvents.join(', ')}`,
        400
      );
    }

    // Create webhook
    const [webhook] = await db
      .insert(webhooks)
      .values({
        url,
        secret,
        events,
        enabled,
      })
      .returning();

    // Log audit entry
    await logAuditEntry({
      userId: (session.user as any)?.id,
      action: AuditActions.WEBHOOK_CREATED,
      resourceType: ResourceTypes.WEBHOOK,
      resourceId: String(webhook.id),
      details: { url: webhook.url, events: webhook.events },
      request,
    });

    return successResponse(webhook, undefined, 201);
  } catch (error) {
    console.error('Create webhook error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create webhook', 500);
  }
};

/**
 * OPTIONS /api/v1/admin/webhooks
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};
