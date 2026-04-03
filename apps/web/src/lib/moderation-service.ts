/**
 * Moderation Service
 * Orchestrates spam detection, duplicate detection, and moderation queue management
 */

import { db } from '@aidepedia/db';
import { articles, spam_flags, duplicate_detection, moderation_queue } from '@aidepedia/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { analyzeSpam, getRecommendedAction, SpamAnalysisResult } from './spam-detection';
import {
  generateMinHashSignature,
  generateSimHash,
  generateContentHash,
  calculateSimilarity,
  determineMatchType,
  findMatchingSections,
} from './duplicate-detection';

export interface ModerationResult {
  needsModeration: boolean;
  spamAnalysis?: SpamAnalysisResult;
  duplicateAnalysis?: {
    hasDuplicates: boolean;
    duplicateCount: number;
    highestSimilarity: number;
    matchType: string;
  };
  autoAction: 'approve' | 'reject' | 'review';
  queueItemId?: number;
}

/**
 * Analyze article for spam and duplicates, add to moderation queue if needed
 */
export async function moderateArticle(
  articleId: number,
  options: {
    checkSpam?: boolean;
    checkDuplicates?: boolean;
    autoApprove?: boolean;
  } = {}
): Promise<ModerationResult> {
  const { checkSpam = true, checkDuplicates = true, autoApprove = false } = options;

  // Get article
  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!article) {
    throw new Error('Article not found');
  }

  let spamAnalysis: SpamAnalysisResult | undefined;
  let duplicateAnalysis: {
    hasDuplicates: boolean;
    duplicateCount: number;
    highestSimilarity: number;
    matchType: string;
  } | undefined;

  // Check for spam
  if (checkSpam) {
    spamAnalysis = analyzeSpam(article.content, article.title);

    // Store spam analysis
    await db.insert(spam_flags).values({
      articleId: article.id,
      spamType: spamAnalysis.spamType,
      spamScore: spamAnalysis.spamScore.toString(),
      confidence: spamAnalysis.confidence.toString(),
      features: spamAnalysis.features,
      detectionMethod: 'hybrid',
      reasons: spamAnalysis.reasons,
      status: spamAnalysis.isSpam ? 'pending' : 'false_positive',
    }).onConflictDoNothing();
  }

  // Check for duplicates
  if (checkDuplicates) {
    const minHashSig = generateMinHashSignature(article.content);
    const simHash = generateSimHash(article.content);
    const contentHash = generateContentHash(article.content);

    // Get all other published articles
    const otherArticles = await db
      .select()
      .from(articles)
      .where(
        and(
          sql`${articles.id} != ${articleId}`,
          sql`${articles.status} = 'published'`
        )
      );

    let highestSimilarity = 0;
    let matchType = 'similar';
    let duplicateCount = 0;

    for (const other of otherArticles) {
      const otherContentHash = generateContentHash(other.content);

      // Quick check for exact duplicates
      if (otherContentHash === contentHash) {
        highestSimilarity = 100;
        matchType = 'exact';
        duplicateCount++;
        
        await db.insert(duplicate_detection).values({
          articleId: article.id,
          duplicateArticleId: other.id,
          similarityScore: '100.00',
          contentHash,
          minhashSignature: JSON.stringify(minHashSig),
          matchType: 'exact',
          matchingSections: null,
          status: 'pending',
        }).onConflictDoNothing();
        
        continue;
      }

      // Calculate similarity
      const similarity = calculateSimilarity(
        article.content,
        other.content,
        minHashSig,
        undefined,
        simHash
      );

      if (similarity.overall >= 50) {
        duplicateCount++;
        
        if (similarity.overall > highestSimilarity) {
          highestSimilarity = similarity.overall;
          matchType = determineMatchType(similarity.overall);
        }

        // Store significant matches
        if (similarity.overall >= 70) {
          const matchingSections = findMatchingSections(article.content, other.content);

          await db.insert(duplicate_detection).values({
            articleId: article.id,
            duplicateArticleId: other.id,
            similarityScore: similarity.overall.toString(),
            contentHash,
            minhashSignature: JSON.stringify(minHashSig),
            matchType,
            matchingSections: matchingSections.length > 0 ? matchingSections : null,
            status: 'pending',
          }).onConflictDoNothing();
        }
      }
    }

    duplicateAnalysis = {
      hasDuplicates: duplicateCount > 0,
      duplicateCount,
      highestSimilarity,
      matchType,
    };
  }

  // Determine auto action
  let autoAction: 'approve' | 'reject' | 'review' = 'review';

  if (spamAnalysis) {
    const recommended = getRecommendedAction(spamAnalysis);
    if (recommended === 'auto_reject') {
      autoAction = 'reject';
    } else if (recommended === 'auto_approve' && !duplicateAnalysis?.hasDuplicates) {
      autoAction = 'approve';
    }
  }

  // Add to moderation queue if needed
  let queueItemId: number | undefined;
  const needsModeration = autoAction === 'review' ||
    (spamAnalysis?.isSpam ?? false) ||
    (duplicateAnalysis?.hasDuplicates ?? false);

  if (needsModeration) {
    // Determine queue type
    let queueType: 'spam' | 'duplicate' | 'quality' | 'manual' = 'manual';
    let priority = 0;
    let reason = '';

    if (spamAnalysis?.isSpam) {
      queueType = 'spam';
      priority = spamAnalysis.spamScore >= 80 ? 10 : spamAnalysis.spamScore >= 60 ? 5 : 1;
      reason = `Spam detected (score: ${spamAnalysis.spamScore}, type: ${spamAnalysis.spamType})`;
    } else if (duplicateAnalysis?.hasDuplicates) {
      queueType = 'duplicate';
      priority = duplicateAnalysis.highestSimilarity >= 95 ? 8 : duplicateAnalysis.highestSimilarity >= 80 ? 4 : 2;
      reason = `Potential duplicate found (similarity: ${duplicateAnalysis.highestSimilarity}%, type: ${duplicateAnalysis.matchType})`;
    }

    const [queueItem] = await db
      .insert(moderation_queue)
      .values({
        articleId: article.id,
        queueType,
        priority,
        autoAction: autoAction === 'reject' ? 'reject' : 'flag',
        reason,
        status: 'pending',
      })
      .returning();

    queueItemId = queueItem.id;
  }

  // Auto-approve if configured and safe
  if (autoApprove && autoAction === 'approve') {
    await db
      .update(articles)
      .set({ status: 'published', updatedAt: new Date() })
      .where(eq(articles.id, articleId));
  }

  // Auto-reject if high confidence spam
  if (autoAction === 'reject') {
    await db
      .update(articles)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(articles.id, articleId));

    await db
      .update(moderation_queue)
      .set({
        status: 'rejected',
        decision: 'Auto-rejected: High confidence spam',
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(moderation_queue.id, queueItemId!));
  }

  return {
    needsModeration,
    spamAnalysis,
    duplicateAnalysis,
    autoAction,
    queueItemId,
  };
}

/**
 * Batch moderate multiple articles
 */
export async function batchModerate(
  articleIds: number[],
  options?: {
    checkSpam?: boolean;
    checkDuplicates?: boolean;
    autoApprove?: boolean;
  }
): Promise<Array<{ articleId: number; result: ModerationResult }>> {
  const results = await Promise.all(
    articleIds.map(async (id) => {
      try {
        const result = await moderateArticle(id, options);
        return { articleId: id, result };
      } catch (error) {
        console.error(`Error moderating article ${id}:`, error);
        return {
          articleId: id,
          result: {
            needsModeration: false,
            autoAction: 'review',
          },
        };
      }
    })
  );

  return results;
}

/**
 * Get articles needing moderation
 */
export async function getArticlesNeedingModeration(limit: number = 50) {
  // Get articles that haven't been checked yet
  const unchecked = await db
    .select({ id: articles.id })
    .from(articles)
    .where(
      and(
        eq(articles.status, 'pending_review'),
        sql`not exists (
          select 1 from ${spam_flags}
          where ${spam_flags.articleId} = ${articles.id}
        )`,
        sql`not exists (
          select 1 from ${moderation_queue}
          where ${moderation_queue.articleId} = ${articles.id}
        )`
      )
    )
    .limit(limit);

  return unchecked.map(a => a.id);
}

/**
 * Run scheduled moderation scan
 */
export async function runModerationScan(limit: number = 100): Promise<{
  scanned: number;
  flagged: number;
  autoApproved: number;
  autoRejected: number;
}> {
  const articleIds = await getArticlesNeedingModeration(limit);

  let flagged = 0;
  let autoApproved = 0;
  let autoRejected = 0;

  for (const articleId of articleIds) {
    try {
      const result = await moderateArticle(articleId, {
        checkSpam: true,
        checkDuplicates: true,
        autoApprove: true,
      });

      if (result.needsModeration) flagged++;
      if (result.autoAction === 'approve') autoApproved++;
      if (result.autoAction === 'reject') autoRejected++;
    } catch (error) {
      console.error(`Error in moderation scan for article ${articleId}:`, error);
    }
  }

  return {
    scanned: articleIds.length,
    flagged,
    autoApproved,
    autoRejected,
  };
}
