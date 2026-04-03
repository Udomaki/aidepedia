import type { APIRoute } from 'astro';
import { db, eq } from '@aidepedia/db';
import { moderation_queue, moderation_actions, articles, spam_flags, duplicate_detection } from '@aidepedia/db/schema';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../../lib/api-utils';
import { getSession } from '../../../../../../lib/auth';

/**
 * POST /api/v1/admin/moderation/[id]/approve
 * Approve flagged content
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const queueId = parseInt(params.id as string, 10);

    if (isNaN(queueId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid queue item ID', 400);
    }

    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const userId = parseInt(session.user.id as string, 10);

    // Get queue item
    const [queueItem] = await db
      .select()
      .from(moderation_queue)
      .where(eq(moderation_queue.id, queueId))
      .limit(1);

    if (!queueItem) {
      return errorResponse('NOT_FOUND', 'Queue item not found', 404);
    }

    if (queueItem.status !== 'pending' && queueItem.status !== 'in_review') {
      return errorResponse(
        'VALIDATION_ERROR',
        'Queue item has already been processed',
        400
      );
    }

    // Parse request body for optional decision reason
    let body = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }
    const { reason } = body as { reason?: string };

    // Update queue item
    await db
      .update(moderation_queue)
      .set({
        status: 'approved',
        decision: reason || 'Approved by moderator',
        decidedBy: userId,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(moderation_queue.id, queueId));

    // Update article status if needed
    if (queueItem.queueType === 'spam') {
      // Mark as false positive
      await db
        .update(spam_flags)
        .set({
          status: 'false_positive',
          reviewedBy: userId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(spam_flags.articleId, queueItem.articleId));

      // Ensure article is published
      await db
        .update(articles)
        .set({ status: 'published', updatedAt: new Date() })
        .where(eq(articles.id, queueItem.articleId));
    } else if (queueItem.queueType === 'duplicate') {
      // Mark as dismissed
      await db
        .update(duplicate_detection)
        .set({
          status: 'dismissed',
          reviewedBy: userId,
          reviewedAt: new Date(),
        })
        .where(eq(duplicate_detection.articleId, queueItem.articleId));
    }

    // Log action
    await db.insert(moderation_actions).values({
      queueItemId: queueId,
      articleId: queueItem.articleId,
      action: 'approved',
      performedBy: userId,
      reason: reason || 'Approved by moderator',
      previousStatus: queueItem.status,
      newStatus: 'approved',
    });

    return successResponse({
      approved: true,
      queueItemId: queueId,
      articleId: queueItem.articleId,
    });
  } catch (error) {
    console.error('Error approving moderation item:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to approve moderation item',
      500
    );
  }
};

/**
 * OPTIONS /api/v1/admin/moderation/[id]/approve
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
