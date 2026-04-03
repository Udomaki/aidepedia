import type { APIRoute } from 'astro';
import { db, eq, and, gte, sql, desc } from '@aidepedia/db';
import { moderation_queue, spam_flags, duplicate_detection, moderation_analytics } from '@aidepedia/db/schema';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';

/**
 * GET /api/v1/admin/moderation/analytics
 * Get moderation analytics and statistics
 */
export const GET: APIRoute = async ({ url, request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Parse query parameters
    const period = url.searchParams.get('period') || '7d'; // 7d, 30d, 90d, all
    
    // Calculate date range
    let startDate = new Date();
    switch (period) {
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '7d':
      default:
        startDate.setDate(startDate.getDate() - 7);
        break;
    }

    // Get spam statistics
    const [spamStats] = await db
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(*) filter (where ${spam_flags.status} = 'pending')`,
        confirmed: sql<number>`count(*) filter (where ${spam_flags.status} = 'confirmed')`,
        falsePositive: sql<number>`count(*) filter (where ${spam_flags.status} = 'false_positive')`,
      })
      .from(spam_flags)
      .where(gte(spam_flags.createdAt, startDate));

    // Get duplicate statistics
    const [duplicateStats] = await db
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(*) filter (where ${duplicate_detection.status} = 'pending')`,
        merged: sql<number>`count(*) filter (where ${duplicate_detection.status} = 'merged')`,
        dismissed: sql<number>`count(*) filter (where ${duplicate_detection.status} = 'dismissed')`,
      })
      .from(duplicate_detection)
      .where(gte(duplicate_detection.createdAt, startDate));

    // Get queue statistics
    const [queueStats] = await db
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(*) filter (where ${moderation_queue.status} = 'pending')`,
        inReview: sql<number>`count(*) filter (where ${moderation_queue.status} = 'in_review')`,
        approved: sql<number>`count(*) filter (where ${moderation_queue.status} = 'approved')`,
        rejected: sql<number>`count(*) filter (where ${moderation_queue.status} = 'rejected')`,
      })
      .from(moderation_queue)
      .where(gte(moderation_queue.createdAt, startDate));

    // Get spam by type breakdown
    const spamByType = await db
      .select({
        spamType: spam_flags.spamType,
        count: sql<number>`count(*)`,
      })
      .from(spam_flags)
      .where(gte(spam_flags.createdAt, startDate))
      .groupBy(spam_flags.spamType);

    // Get queue by type breakdown
    const queueByType = await db
      .select({
        queueType: moderation_queue.queueType,
        count: sql<number>`count(*)`,
      })
      .from(moderation_queue)
      .where(gte(moderation_queue.createdAt, startDate))
      .groupBy(moderation_queue.queueType);

    // Get average spam score
    const [avgSpamScore] = await db
      .select({
        avg: sql<number>`avg(${spam_flags.spamScore})`,
      })
      .from(spam_flags)
      .where(gte(spam_flags.createdAt, startDate));

    // Get average similarity score for duplicates
    const [avgSimilarityScore] = await db
      .select({
        avg: sql<number>`avg(${duplicate_detection.similarityScore})`,
      })
      .from(duplicate_detection)
      .where(gte(duplicate_detection.createdAt, startDate));

    // Calculate false positive rate
    const totalProcessed = Number(spamStats.confirmed) + Number(spamStats.falsePositive);
    const falsePositiveRate = totalProcessed > 0
      ? (Number(spamStats.falsePositive) / totalProcessed) * 100
      : 0;

    // Get daily trends (last 7 days)
    const dailyTrends = await db
      .select({
        date: sql<string>`date(${moderation_queue.createdAt})`,
        items: sql<number>`count(*)`,
      })
      .from(moderation_queue)
      .where(gte(moderation_queue.createdAt, startDate))
      .groupBy(sql`date(${moderation_queue.createdAt})`)
      .orderBy(sql`date(${moderation_queue.createdAt})`);

    // Calculate average queue time (time from creation to decision)
    const [avgQueueTime] = await db
      .select({
        avgHours: sql<number>`avg(extract(epoch from (${moderation_queue.decidedAt} - ${moderation_queue.createdAt})) / 3600)`,
      })
      .from(moderation_queue)
      .where(
        and(
          gte(moderation_queue.createdAt, startDate),
          sql`${moderation_queue.decidedAt} is not null`
        )
      );

    return successResponse({
      period,
      startDate,
      endDate: new Date(),
      summary: {
        totalItems: Number(queueStats.total),
        pendingItems: Number(queueStats.pending),
        processedItems: Number(queueStats.approved) + Number(queueStats.rejected),
        falsePositiveRate: Math.round(falsePositiveRate * 100) / 100,
      },
      spam: {
        total: Number(spamStats.total),
        pending: Number(spamStats.pending),
        confirmed: Number(spamStats.confirmed),
        falsePositive: Number(spamStats.falsePositive),
        avgSpamScore: avgSpamScore.avg ? Number(avgSpamScore.avg).toFixed(2) : '0.00',
        byType: spamByType.reduce((acc, item) => {
          acc[item.spamType] = Number(item.count);
          return acc;
        }, {} as Record<string, number>),
      },
      duplicates: {
        total: Number(duplicateStats.total),
        pending: Number(duplicateStats.pending),
        merged: Number(duplicateStats.merged),
        dismissed: Number(duplicateStats.dismissed),
        avgSimilarityScore: avgSimilarityScore.avg ? Number(avgSimilarityScore.avg).toFixed(2) : '0.00',
      },
      queue: {
        total: Number(queueStats.total),
        pending: Number(queueStats.pending),
        inReview: Number(queueStats.inReview),
        approved: Number(queueStats.approved),
        rejected: Number(queueStats.rejected),
        avgQueueTimeHours: avgQueueTime.avgHours
          ? Number(avgQueueTime.avgHours).toFixed(2)
          : '0.00',
        byType: queueByType.reduce((acc, item) => {
          acc[item.queueType] = Number(item.count);
          return acc;
        }, {} as Record<string, number>),
      },
      trends: dailyTrends.map(t => ({
        date: t.date,
        count: Number(t.items),
      })),
    });
  } catch (error) {
    console.error('Error fetching moderation analytics:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch moderation analytics',
      500
    );
  }
};

/**
 * OPTIONS /api/v1/admin/moderation/analytics
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
