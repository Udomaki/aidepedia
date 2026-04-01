import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { db } from '@aidepedia/db';
import { webhooks } from '@aidepedia/db/schema';
import { successResponse, errorResponse } from '../../../../../lib/api-utils';
import { eq } from '@aidepedia/db';
import { logAuditEntry, AuditActions, ResourceTypes } from '../../../../../lib/audit';

/**
 * GET /api/v1/admin/webhooks/[id]
 * Get a single webhook (admin only)
 */
export const GET: APIRoute = async ({ request, params }) => {
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

    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, webhookId))
      .limit(1);

    if (!webhook) {
      return errorResponse('NOT_FOUND', 'Webhook not found', 404);
    }

    return successResponse(webhook);
  } catch (error) {
    console.error('Get webhook error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to get webhook', 500);
  }
};

/**
 * PUT /api/v1/admin/webhooks/[id]
 * Update a webhook (admin only)
 */
export const PUT: APIRoute = async ({ request, params }) => {
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

    const body = await request.json();
    const { url, secret, events, enabled } = body;

    // Validate events if provided
    if (events) {
      if (!Array.isArray(events) || events.length === 0) {
        return errorResponse('VALIDATION_ERROR', 'Events must be a non-empty array', 400);
      }

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
    }

    // Update webhook
    const [updated] = await db
      .update(webhooks)
      .set({
        ...(url !== undefined && { url }),
        ...(secret !== undefined && { secret }),
        ...(events !== undefined && { events }),
        ...(enabled !== undefined && { enabled }),
        updatedAt: new Date(),
      })
      .where(eq(webhooks.id, webhookId))
      .returning();

    // Log audit entry
    await logAuditEntry({
      userId: (session.user as any)?.id,
      action: AuditActions.WEBHOOK_UPDATED,
      resourceType: ResourceTypes.WEBHOOK,
      resourceId: String(webhookId),
      details: { 
        changes: { url, events, enabled },
        previousUrl: existing.url,
      },
      request,
    });

    return successResponse(updated);
  } catch (error) {
    console.error('Update webhook error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to update webhook', 500);
  }
};

/**
 * DELETE /api/v1/admin/webhooks/[id]
 * Delete a webhook (admin only)
 */
export const DELETE: APIRoute = async ({ request, params }) => {
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

    // Delete webhook
    await db.delete(webhooks).where(eq(webhooks.id, webhookId));

    // Log audit entry
    await logAuditEntry({
      userId: (session.user as any)?.id,
      action: AuditActions.WEBHOOK_DELETED,
      resourceType: ResourceTypes.WEBHOOK,
      resourceId: String(webhookId),
      details: { url: existing.url },
      request,
    });

    return successResponse({ deleted: true });
  } catch (error) {
    console.error('Delete webhook error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to delete webhook', 500);
  }
};

/**
 * OPTIONS /api/v1/admin/webhooks/[id]
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};
