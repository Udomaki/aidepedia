/**
 * Moderation Query functions
 */

import { db } from '../index';
import { eq, and, desc, sql, count, gte } from 'drizzle-orm';
import {
  moderation_queue,
  spam_flags,
  duplicate_detection,
  moderation_actions,
  articles
} from '../schema/index';

export async function getModerationQueue(params: {
  status?: string;
  queueType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: any[]; total: number }> {
  const { status, queueType, limit = 20, offset = 0 } = params;

  const conditions = [];

  if (status && status !== 'all') {
    conditions.push(eq(moderation_queue.status, status as any));
  }

  if (queueType) {
    conditions.push(eq(moderation_queue.queueType, queueType as any));
  }

  const whereClause = conditions.length > 0 ? and(...conditions as any) : undefined;

  const items = await db
    .select({
      id: moderation_queue.id,
      articleId: moderation_queue.articleId,
      queueType: moderation_queue.queueType,
      priority: moderation_queue.priority,
      autoAction: moderation_queue.autoAction,
      reason: moderation_queue.reason,
      metadata: moderation_queue.metadata,
      status: moderation_queue.status,
      assignedTo: moderation_queue.assignedTo,
      assignedAt: moderation_queue.assignedAt,
      decision: moderation_queue.decision,
      decidedBy: moderation_queue.decidedBy,
      decidedAt: moderation_queue.decidedAt,
      createdAt: moderation_queue.createdAt,
      updatedAt: moderation_queue.updatedAt,
    })
    .from(moderation_queue)
    .innerJoin(articles, eq(moderation_queue.articleId, articles.id))
    .where(whereClause)
    .orderBy(desc(moderation_queue.priority), desc(moderation_queue.createdAt))
    .limit(limit)
    .offset(offset);

  const countResult = await db
    .select({ count: count() })
    .from(moderation_queue)
    .where(whereClause);

  const total = countResult[0]?.count || 0;

  return { items, total };
}

export async function getModerationItemById(id: number) {
  const [item] = await db
    .select()
    .from(moderation_queue)
    .where(eq(moderation_queue.id, id))
    .limit(1);
  
  return item;
}

export async function updateModerationItem(id: number, data: any) {
  const [updated] = await db
    .update(moderation_queue)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(moderation_queue.id, id))
    .returning();
  
  return updated;
}

export async function createModerationAction(data: {
  queueItemId: number;
  articleId: number;
  action: string;
  performedBy: number;
  reason?: string;
  previousStatus?: string;
  newStatus?: string;
}) {
  const [action] = await db
    .insert(moderation_actions)
    .values({
      queueItemId: data.queueItemId,
      articleId: data.articleId,
      action: data.action as any,
      performedBy: data.performedBy,
      reason: data.reason,
      previousStatus: data.previousStatus,
      newStatus: data.newStatus,
    })
    .returning();

  return action;
}
