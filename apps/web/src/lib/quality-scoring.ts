/**
 * Content Quality Scoring Algorithm for AIdepedia (OC-131)
 * 
 * Multi-factor quality scoring system that evaluates articles across 5 dimensions:
 * - Completeness (0-25): Has title, summary, content, tags, category
 * - Readability (0-20): Flesch-Kincaid score, sentence length, paragraph structure
 * - Engagement (0-20): Views, upvotes, comments, bookmarks (relative to age)
 * - Freshness (0-15): Recently updated vs stale
 * - Accuracy (0-20): References, citations, verified status
 */

import { db, eq, and, desc, sql, gte, count } from '@aidepedia/db';
import { 
  articles, 
  comments, 
  bookmarks, 
  quality_scores, 
  quality_badges,
  quality_score_history,
  article_references 
} from '@aidepedia/db/schema';

// Types
export interface QualityScoreBreakdown {
  completeness: {
    score: number;
    hasTitle: boolean;
    hasSummary: boolean;
    hasContent: boolean;
    hasTags: boolean;
    hasCategory: boolean;
    tagCount: number;
    wordCount: number;
  };
  readability: {
    score: number;
    fleschKincaid: number;
    avgSentenceLength: number;
    avgParagraphLength: number;
    sentenceCount: number;
    paragraphCount: number;
  };
  engagement: {
    score: number;
    viewCount: number;
    upvoteCount: number;
    commentCount: number;
    bookmarkCount: number;
    viewsPerDay: number;
    upvoteRate: number;
  };
  freshness: {
    score: number;
    daysSinceUpdate: number;
    isRecentlyUpdated: boolean;
    updateFrequency: number;
  };
  accuracy: {
    score: number;
    hasReferences: boolean;
    referenceCount: number;
    isVerified: boolean;
    citationScore: number;
  };
}

export interface QualityScore {
  overallScore: number;
  completenessScore: number;
  readabilityScore: number;
  engagementScore: number;
  freshnessScore: number;
  accuracyScore: number;
  breakdown: QualityScoreBreakdown;
  badges: BadgeType[];
}

export type BadgeType = 'featured' | 'verified' | 'comprehensive' | 'trending' | 'needs_improvement';

export interface QualityAnalytics {
  scoreDistribution: {
    '0-19': number;
    '20-39': number;
    '40-59': number;
    '60-79': number;
    '80-89': number;
    '90-100': number;
  };
  tierCounts: {
    featured: number;
    verified: number;
    good: number;
    average: number;
    needsImprovement: number;
  };
  badgeCounts: {
    featured: number;
    verified: number;
    comprehensive: number;
    trending: number;
    needsImprovement: number;
  };
  avgScores: {
    overall: number;
    completeness: number;
    readability: number;
    engagement: number;
    freshness: number;
    accuracy: number;
  };
  topArticles: Array<{ articleId: number; title: string; score: number }>;
  lowestArticles: Array<{ articleId: number; title: string; score: number; issues: string[] }>;
}

/**
 * Calculate Flesch-Kincaid Grade Level
 * Formula: 0.39 * (total words / total sentences) + 11.8 * (total syllables / total words) - 15.59
 */
function calculateFleschKincaid(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  
  if (wordCount === 0) return 0;
  
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = Math.max(sentences.length, 1);
  
  // Count syllables (simplified estimation)
  const syllableCount = words.reduce((count, word) => {
    return count + countSyllables(word);
  }, 0);
  
  const gradeLevel = 0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59;
  
  // Normalize to 0-20 score (lower grade level = higher score)
  // Grade 8 or below = 20, Grade 18+ = 0
  return Math.max(0, Math.min(20, 20 - (gradeLevel - 8)));
}

/**
 * Count syllables in a word (simplified)
 */
function countSyllables(word: string): number {
  word = word.toLowerCase().trim();
  if (word.length <= 3) return 1;
  
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

/**
 * Calculate completeness score (0-25)
 * Checks for presence of essential article components
 */
function calculateCompletenessScore(article: any): { score: number; breakdown: any } {
  let score = 0;
  const breakdown = {
    hasTitle: false,
    hasSummary: false,
    hasContent: false,
    hasTags: false,
    hasCategory: false,
    tagCount: 0,
    wordCount: 0,
  };
  
  // Title (5 points)
  if (article.title && article.title.trim().length > 0) {
    score += 5;
    breakdown.hasTitle = true;
  }
  
  // Summary/Excerpt (5 points)
  if (article.excerpt && article.excerpt.trim().length >= 20) {
    score += 5;
    breakdown.hasSummary = true;
  }
  
  // Content (5 points)
  if (article.content && article.content.trim().length >= 100) {
    score += 5;
    breakdown.hasContent = true;
    breakdown.wordCount = article.content.split(/\s+/).filter((w: string) => w.length > 0).length;
  }
  
  // Tags (5 points)
  const tagCount = article.tags?.length || 0;
  breakdown.tagCount = tagCount;
  if (tagCount >= 3) {
    score += 5;
    breakdown.hasTags = true;
  } else if (tagCount >= 1) {
    score += 2;
  }
  
  // Category (5 points)
  if (article.categoryId) {
    score += 5;
    breakdown.hasCategory = true;
  }
  
  return { score: Math.min(25, score), breakdown };
}

/**
 * Calculate readability score (0-20)
 * Based on Flesch-Kincaid and content structure
 */
function calculateReadabilityScore(content: string): { score: number; breakdown: any } {
  if (!content || content.trim().length === 0) {
    return {
      score: 0,
      breakdown: {
        fleschKincaid: 0,
        avgSentenceLength: 0,
        avgParagraphLength: 0,
        sentenceCount: 0,
        paragraphCount: 0,
      },
    };
  }
  
  const fleschKincaid = calculateFleschKincaid(content);
  
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
  const words = content.split(/\s+/).filter(w => w.length > 0);
  
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
  const avgParagraphLength = paragraphs.length > 0 ? words.length / paragraphs.length : 0;
  
  // Score breakdown:
  // - Flesch-Kincaid score: 0-12 points (normalized from 0-20 to 0-12)
  // - Sentence length (15-25 words optimal): 0-4 points
  // - Paragraph length (40-80 words optimal): 0-4 points
  
  let sentenceScore = 0;
  if (avgSentenceLength >= 15 && avgSentenceLength <= 25) {
    sentenceScore = 4;
  } else if (avgSentenceLength >= 10 && avgSentenceLength <= 30) {
    sentenceScore = 2;
  }
  
  let paragraphScore = 0;
  if (avgParagraphLength >= 40 && avgParagraphLength <= 80) {
    paragraphScore = 4;
  } else if (avgParagraphLength >= 20 && avgParagraphLength <= 100) {
    paragraphScore = 2;
  }
  
  const score = Math.min(20, (fleschKincaid * 12 / 20) + sentenceScore + paragraphScore);
  
  return {
    score,
    breakdown: {
      fleschKincaid: Math.round(fleschKincaid * 10) / 10,
      avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
      avgParagraphLength: Math.round(avgParagraphLength * 10) / 10,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
    },
  };
}

/**
 * Calculate engagement score (0-20)
 * Age-adjusted engagement metrics
 */
async function calculateEngagementScore(
  articleId: number, 
  createdAt: Date, 
  viewCount: number, 
  upvotes: number
): Promise<{ score: number; breakdown: any }> {
  const now = new Date();
  const ageInDays = Math.max(1, Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
  
  // Get comment count
  const [commentResult] = await db
    .select({ count: count() })
    .from(comments)
    .where(eq(comments.articleId, articleId));
  const commentCount = commentResult?.count || 0;
  
  // Get bookmark count
  const [bookmarkResult] = await db
    .select({ count: count() })
    .from(bookmarks)
    .where(eq(bookmarks.articleId, articleId));
  const bookmarkCount = bookmarkResult?.count || 0;
  
  // Calculate normalized metrics
  const viewsPerDay = viewCount / ageInDays;
  const totalVotes = upvotes; // Assuming downvotes don't reduce upvotes for engagement
  const upvoteRate = viewCount > 0 ? (upvotes / viewCount) * 100 : 0;
  
  // Score calculation:
  // - Views per day (normalized): 0-5 points
  // - Upvote rate: 0-5 points
  // - Comments (normalized by age): 0-5 points
  // - Bookmarks (normalized by age): 0-5 points
  
  let viewsScore = 0;
  if (viewsPerDay >= 10) viewsScore = 5;
  else if (viewsPerDay >= 5) viewsScore = 4;
  else if (viewsPerDay >= 2) viewsScore = 3;
  else if (viewsPerDay >= 1) viewsScore = 2;
  else if (viewsPerDay >= 0.5) viewsScore = 1;
  
  let upvoteScore = 0;
  if (upvoteRate >= 5) upvoteScore = 5;
  else if (upvoteRate >= 3) upvoteScore = 4;
  else if (upvoteRate >= 2) upvoteScore = 3;
  else if (upvoteRate >= 1) upvoteScore = 2;
  else if (upvoteRate >= 0.5) upvoteScore = 1;
  
  const commentsPerDay = commentCount / ageInDays;
  let commentScore = 0;
  if (commentsPerDay >= 0.5) commentScore = 5;
  else if (commentsPerDay >= 0.2) commentScore = 4;
  else if (commentsPerDay >= 0.1) commentScore = 3;
  else if (commentsPerDay >= 0.05) commentScore = 2;
  else if (commentsPerDay > 0) commentScore = 1;
  
  const bookmarksPerDay = bookmarkCount / ageInDays;
  let bookmarkScore = 0;
  if (bookmarksPerDay >= 0.5) bookmarkScore = 5;
  else if (bookmarksPerDay >= 0.2) bookmarkScore = 4;
  else if (bookmarksPerDay >= 0.1) bookmarkScore = 3;
  else if (bookmarksPerDay >= 0.05) bookmarkScore = 2;
  else if (bookmarksPerDay > 0) bookmarkScore = 1;
  
  const score = Math.min(20, viewsScore + upvoteScore + commentScore + bookmarkScore);
  
  return {
    score,
    breakdown: {
      viewCount,
      upvoteCount: upvotes,
      commentCount,
      bookmarkCount,
      viewsPerDay: Math.round(viewsPerDay * 100) / 100,
      upvoteRate: Math.round(upvoteRate * 100) / 100,
    },
  };
}

/**
 * Calculate freshness score (0-15)
 * Based on recency of updates
 */
function calculateFreshnessScore(createdAt: Date, updatedAt: Date): { score: number; breakdown: any } {
  const now = new Date();
  const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
  const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate update frequency (number of updates relative to age)
  const hasBeenUpdated = updatedAt.getTime() > createdAt.getTime();
  const updateFrequency = hasBeenUpdated ? 1 : 0;
  
  // Score calculation:
  // - Recently updated (< 30 days): 15 points
  // - Moderately fresh (30-90 days): 10 points
  // - Somewhat stale (90-180 days): 5 points
  // - Stale (> 180 days): 0 points
  
  let score = 0;
  if (daysSinceUpdate < 30) score = 15;
  else if (daysSinceUpdate < 90) score = 10;
  else if (daysSinceUpdate < 180) score = 5;
  
  // Bonus for being newly created (< 7 days)
  if (daysSinceCreation < 7) {
    score = Math.min(15, score + 5);
  }
  
  return {
    score,
    breakdown: {
      daysSinceUpdate,
      isRecentlyUpdated: daysSinceUpdate < 30,
      updateFrequency,
    },
  };
}

/**
 * Calculate accuracy score (0-20)
 * Based on references, citations, and verification status
 */
async function calculateAccuracyScore(articleId: number): Promise<{ score: number; breakdown: any }> {
  // Get references for this article
  const references = await db
    .select()
    .from(article_references)
    .where(eq(article_references.articleId, articleId));
  
  const referenceCount = references.length;
  const verifiedReferences = references.filter(r => r.isVerified).length;
  const hasReferences = referenceCount > 0;
  const isVerified = verifiedReferences > 0;
  
  // Calculate citation score (0-1 normalized)
  const citationScore = referenceCount > 0 ? Math.min(1, referenceCount / 5) : 0;
  
  // Score calculation:
  // - Has references: 0-8 points (based on count, max at 5)
  // - Verified references: 0-8 points (bonus for verified refs)
  // - Citation score: 0-4 points (quality of citations)
  
  const referenceScore = Math.min(8, referenceCount * 1.6);
  const verifiedScore = Math.min(8, verifiedReferences * 2);
  const citationQualityScore = citationScore * 4;
  
  const score = Math.min(20, referenceScore + verifiedScore + citationQualityScore);
  
  return {
    score,
    breakdown: {
      hasReferences,
      referenceCount,
      isVerified,
      citationScore: Math.round(citationScore * 100) / 100,
    },
  };
}

/**
 * Determine quality badges based on score and metrics
 */
function determineBadges(score: number, breakdown: QualityScoreBreakdown): BadgeType[] {
  const badges: BadgeType[] = [];
  
  // Featured Article (90+)
  if (score >= 90) {
    badges.push('featured');
  }
  // Verified (80-89)
  else if (score >= 80) {
    badges.push('verified');
  }
  
  // Comprehensive (85+ completeness)
  if (breakdown.completeness.score >= 21) { // 21/25 = 84%
    badges.push('comprehensive');
  }
  
  // Trending (high engagement velocity)
  if (breakdown.engagement.viewsPerDay >= 5 && breakdown.engagement.upvoteRate >= 2) {
    badges.push('trending');
  }
  
  // Needs Improvement (below 50)
  if (score < 50) {
    badges.push('needs_improvement');
  }
  
  return badges;
}

/**
 * Calculate quality score for an article
 */
export async function calculateQualityScore(articleId: number): Promise<QualityScore> {
  // Fetch article
  const [article] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  
  if (!article) {
    throw new Error(`Article ${articleId} not found`);
  }
  
  // Calculate dimension scores
  const { score: completenessScore, breakdown: completenessBreakdown } = calculateCompletenessScore(article);
  const { score: readabilityScore, breakdown: readabilityBreakdown } = calculateReadabilityScore(article.content);
  const { score: engagementScore, breakdown: engagementBreakdown } = await calculateEngagementScore(
    article.id,
    article.createdAt,
    article.viewCount,
    article.upvotes
  );
  const { score: freshnessScore, breakdown: freshnessBreakdown } = calculateFreshnessScore(
    article.createdAt,
    article.updatedAt
  );
  const { score: accuracyScore, breakdown: accuracyBreakdown } = await calculateAccuracyScore(article.id);
  
  // Calculate overall score (sum of all dimensions)
  const overallScore = Math.round(
    completenessScore + readabilityScore + engagementScore + freshnessScore + accuracyScore
  );
  
  const breakdown: QualityScoreBreakdown = {
    completeness: { score: completenessScore, ...completenessBreakdown },
    readability: { score: readabilityScore, ...readabilityBreakdown },
    engagement: { score: engagementScore, ...engagementBreakdown },
    freshness: { score: freshnessScore, ...freshnessBreakdown },
    accuracy: { score: accuracyScore, ...accuracyBreakdown },
  };
  
  // Determine badges
  const badges = determineBadges(overallScore, breakdown);
  
  return {
    overallScore,
    completenessScore,
    readabilityScore,
    engagementScore,
    freshnessScore,
    accuracyScore,
    breakdown,
    badges,
  };
}

/**
 * Save quality score to database
 */
export async function saveQualityScore(
  articleId: number, 
  qualityScore: QualityScore,
  changeReason: 'initial' | 'content_update' | 'engagement_update' | 'manual_review' | 'system_recalc' = 'system_recalc'
): Promise<void> {
  // Upsert quality score
  await db
    .insert(quality_scores)
    .values({
      articleId,
      overallScore: qualityScore.overallScore,
      completenessScore: qualityScore.completenessScore,
      readabilityScore: qualityScore.readabilityScore,
      engagementScore: qualityScore.engagementScore,
      freshnessScore: qualityScore.freshnessScore,
      accuracyScore: qualityScore.accuracyScore,
      breakdown: qualityScore.breakdown,
      calculatedAt: new Date(),
      version: 1,
    })
    .onConflictDoUpdate({
      target: quality_scores.articleId,
      set: {
        overallScore: qualityScore.overallScore,
        completenessScore: qualityScore.completenessScore,
        readabilityScore: qualityScore.readabilityScore,
        engagementScore: qualityScore.engagementScore,
        freshnessScore: qualityScore.freshnessScore,
        accuracyScore: qualityScore.accuracyScore,
        breakdown: qualityScore.breakdown,
        calculatedAt: new Date(),
        version: sql`${quality_scores.version} + 1`,
      },
    });
  
  // Record history
  await db.insert(quality_score_history).values({
    articleId,
    overallScore: qualityScore.overallScore,
    completenessScore: qualityScore.completenessScore,
    readabilityScore: qualityScore.readabilityScore,
    engagementScore: qualityScore.engagementScore,
    freshnessScore: qualityScore.freshnessScore,
    accuracyScore: qualityScore.accuracyScore,
    changeReason,
  });
  
  // Update article's quality score
  await db
    .update(articles)
    .set({ qualityScore: qualityScore.overallScore })
    .where(eq(articles.id, articleId));
  
  // Update badges
  await updateBadges(articleId, qualityScore.badges);
}

/**
 * Update quality badges for an article
 */
async function updateBadges(articleId: number, newBadges: BadgeType[]): Promise<void> {
  // Deactivate all existing badges
  await db
    .update(quality_badges)
    .set({ isActive: false, removedAt: new Date() })
    .where(and(
      eq(quality_badges.articleId, articleId),
      eq(quality_badges.isActive, true)
    ));
  
  // Insert new badges
  for (const badgeType of newBadges) {
    await db
      .insert(quality_badges)
      .values({
        articleId,
        badgeType,
        isActive: true,
        awardedAt: new Date(),
        badgeData: {
          awardedAt: new Date().toISOString(),
        },
      })
      .onConflictDoUpdate({
        target: [quality_badges.articleId, quality_badges.badgeType],
        set: {
          isActive: true,
          awardedAt: new Date(),
          removedAt: null,
          badgeData: {
            awardedAt: new Date().toISOString(),
          },
        },
      });
  }
}

/**
 * Get quality score for an article
 */
export async function getQualityScore(articleId: number): Promise<QualityScore | null> {
  const [score] = await db
    .select()
    .from(quality_scores)
    .where(eq(quality_scores.articleId, articleId))
    .limit(1);
  
  if (!score) {
    return null;
  }
  
  // Get active badges
  const badges = await db
    .select()
    .from(quality_badges)
    .where(and(
      eq(quality_badges.articleId, articleId),
      eq(quality_badges.isActive, true)
    ));
  
  return {
    overallScore: score.overallScore,
    completenessScore: score.completenessScore,
    readabilityScore: score.readabilityScore,
    engagementScore: score.engagementScore,
    freshnessScore: score.freshnessScore,
    accuracyScore: score.accuracyScore,
    breakdown: score.breakdown as QualityScoreBreakdown,
    badges: badges.map(b => b.badgeType as BadgeType),
  };
}

/**
 * Get quality analytics for dashboard
 */
export async function getQualityAnalytics(): Promise<QualityAnalytics> {
  // Get all quality scores
  const scores = await db
    .select({
      overallScore: quality_scores.overallScore,
      completenessScore: quality_scores.completenessScore,
      readabilityScore: quality_scores.readabilityScore,
      engagementScore: quality_scores.engagementScore,
      freshnessScore: quality_scores.freshnessScore,
      accuracyScore: quality_scores.accuracyScore,
      articleId: quality_scores.articleId,
      title: articles.title,
    })
    .from(quality_scores)
    .leftJoin(articles, eq(quality_scores.articleId, articles.id));
  
  // Calculate distribution
  const distribution = {
    '0-19': 0,
    '20-39': 0,
    '40-59': 0,
    '60-79': 0,
    '80-89': 0,
    '90-100': 0,
  };
  
  scores.forEach(s => {
    if (s.overallScore < 20) distribution['0-19']++;
    else if (s.overallScore < 40) distribution['20-39']++;
    else if (s.overallScore < 60) distribution['40-59']++;
    else if (s.overallScore < 80) distribution['60-79']++;
    else if (s.overallScore < 90) distribution['80-89']++;
    else distribution['90-100']++;
  });
  
  // Calculate tier counts
  const tierCounts = {
    featured: distribution['90-100'],
    verified: distribution['80-89'],
    good: distribution['60-79'],
    average: distribution['40-59'],
    needsImprovement: distribution['0-19'] + distribution['20-39'],
  };
  
  // Get badge counts
  const badgeResults = await db
    .select({
      badgeType: quality_badges.badgeType,
      count: count(),
    })
    .from(quality_badges)
    .where(eq(quality_badges.isActive, true))
    .groupBy(quality_badges.badgeType);
  
  const badgeCounts = {
    featured: 0,
    verified: 0,
    comprehensive: 0,
    trending: 0,
    needsImprovement: 0,
  };
  
  badgeResults.forEach(b => {
    badgeCounts[b.badgeType as keyof typeof badgeCounts] = b.count;
  });
  
  // Calculate averages
  const total = scores.length || 1;
  const avgScores = {
    overall: Math.round(scores.reduce((sum, s) => sum + s.overallScore, 0) / total),
    completeness: Math.round(scores.reduce((sum, s) => sum + s.completenessScore, 0) / total),
    readability: Math.round(scores.reduce((sum, s) => sum + s.readabilityScore, 0) / total),
    engagement: Math.round(scores.reduce((sum, s) => sum + s.engagementScore, 0) / total),
    freshness: Math.round(scores.reduce((sum, s) => sum + s.freshnessScore, 0) / total),
    accuracy: Math.round(scores.reduce((sum, s) => sum + s.accuracyScore, 0) / total),
  };
  
  // Get top articles
  const topArticles = scores
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 10)
    .map(s => ({
      articleId: s.articleId,
      title: s.title || 'Unknown',
      score: s.overallScore,
    }));
  
  // Get lowest articles with issues
  const lowestArticles = scores
    .sort((a, b) => a.overallScore - b.overallScore)
    .slice(0, 10)
    .map(s => {
      const issues: string[] = [];
      if (s.completenessScore < 15) issues.push('Low completeness');
      if (s.readabilityScore < 10) issues.push('Poor readability');
      if (s.engagementScore < 5) issues.push('Low engagement');
      if (s.freshnessScore < 5) issues.push('Outdated content');
      if (s.accuracyScore < 10) issues.push('Missing references');
      
      return {
        articleId: s.articleId,
        title: s.title || 'Unknown',
        score: s.overallScore,
        issues,
      };
    });
  
  return {
    scoreDistribution: distribution,
    tierCounts,
    badgeCounts,
    avgScores,
    topArticles,
    lowestArticles,
  };
}

/**
 * Recalculate quality scores for all articles
 */
export async function recalculateAllQualityScores(
  batchSize: number = 50,
  onProgress?: (current: number, total: number) => void
): Promise<{ total: number; updated: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;
  
  // Get all published articles
  const allArticles = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.status, 'published'));
  
  const total = allArticles.length;
  
  // Process in batches
  for (let i = 0; i < allArticles.length; i += batchSize) {
    const batch = allArticles.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (article) => {
        try {
          const score = await calculateQualityScore(article.id);
          await saveQualityScore(article.id, score, 'system_recalc');
          updated++;
        } catch (error) {
          errors.push(`Article ${article.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      })
    );
    
    if (onProgress) {
      onProgress(Math.min(i + batchSize, total), total);
    }
  }
  
  return { total, updated, errors };
}
