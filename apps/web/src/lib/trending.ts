/**
 * Trending Content Algorithm
 * 
 * Implements velocity-based trending scores (not just total views)
 * Calculates momentum and acceleration of content engagement
 */

import { db, eq, desc, gte, not, inArray, and } from '@aidepedia/db';
import { 
  articles, 
  article_trending_scores,
  recommendation_interactions,
  page_views
} from '@aidepedia/db/schema';

// Types
export interface TrendingArticle {
  article: typeof articles.$inferSelect;
  trendingScore: number;
  viewVelocity: number;
  upvoteVelocity: number;
  commentVelocity: number;
  rank: number;
}

export type TimeWindow = '24h' | '7d' | '30d';

/**
 * Calculate time window in hours
 */
function getWindowHours(window: TimeWindow): number {
  switch (window) {
    case '24h':
      return 24;
    case '7d':
      return 24 * 7;
    case '30d':
      return 24 * 30;
    default:
      return 24;
  }
}

/**
 * Calculate trending scores for all articles
 * Should be run as a background job periodically
 */
export async function calculateTrendingScores(
  window: TimeWindow = '24h'
): Promise<void> {
  const windowHours = getWindowHours(window);
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const windowEnd = new Date();
  
  // Get all published articles
  const publishedArticles = await db
    .select()
    .from(articles)
    .where(eq(articles.status, 'published'));
  
  for (const article of publishedArticles) {
    // Calculate view velocity (views per hour)
    const views = await db
      .select()
      .from(page_views)
      .where(and(
        eq(page_views.articleId, article.id),
        gte(page_views.createdAt, windowStart)
      ));
    
    const viewVelocity = views.length / windowHours;
    
    // Calculate upvote velocity (upvotes per hour)
    // Note: This would need actual upvote tracking - using viewCount as proxy for now
    const upvoteVelocity = (article.upvotes || 0) / windowHours;
    
    // Calculate comment velocity (comments per hour)
    // Note: Would need comments table - using 0 for now
    const commentVelocity = 0;
    
    // Calculate share velocity (shares per hour)
    const shareInteractions = await db
      .select()
      .from(recommendation_interactions)
      .where(and(
        eq(recommendation_interactions.articleId, article.id),
        eq(recommendation_interactions.interactionType, 'share'),
        gte(recommendation_interactions.createdAt, windowStart)
      ));
    
    const shareVelocity = shareInteractions.length / windowHours;
    
    // Calculate composite trending score
    // Weighted combination of velocities
    const trendingScore = 
      viewVelocity * 1.0 + 
      upvoteVelocity * 2.0 + 
      commentVelocity * 3.0 + 
      shareVelocity * 4.0;
    
    // Insert or update trending score
    await db
      .insert(article_trending_scores)
      .values({
        articleId: article.id,
        viewVelocity,
        upvoteVelocity,
        commentVelocity,
        shareVelocity,
        trendingScore,
        windowStart,
        windowEnd,
        categoryId: article.categoryId,
      })
      .onConflictDoUpdate({
        target: [article_trending_scores.articleId, article_trending_scores.windowStart],
        set: {
          viewVelocity,
          upvoteVelocity,
          commentVelocity,
          shareVelocity,
          trendingScore,
          windowEnd,
          updatedAt: new Date(),
        },
      });
  }
  
  // Update rankings
  await updateRankings(window);
}

/**
 * Update global and category rankings
 */
async function updateRankings(window: TimeWindow): Promise<void> {
  const windowHours = getWindowHours(window);
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  
  // Get all trending scores for this window
  const scores = await db
    .select()
    .from(article_trending_scores)
    .where(gte(article_trending_scores.windowStart, windowStart))
    .orderBy(desc(article_trending_scores.trendingScore));
  
  // Update global rankings
  for (let i = 0; i < scores.length; i++) {
    await db
      .update(article_trending_scores)
      .set({ globalRank: i + 1 })
      .where(eq(article_trending_scores.id, scores[i].id));
  }
  
  // Update category rankings
  const categoryMap = new Map<number, typeof scores>();
  for (const score of scores) {
    if (score.categoryId) {
      const categoryScores = categoryMap.get(score.categoryId) || [];
      categoryScores.push(score);
      categoryMap.set(score.categoryId, categoryScores);
    }
  }
  
  for (const [categoryId, categoryScores] of categoryMap) {
    for (let i = 0; i < categoryScores.length; i++) {
      await db
        .update(article_trending_scores)
        .set({ categoryRank: i + 1 })
        .where(eq(article_trending_scores.id, categoryScores[i].id));
    }
  }
}

/**
 * Get trending articles
 */
export async function getTrendingArticles(
  window: TimeWindow = '24h',
  categoryId?: number,
  limit: number = 20,
  offset: number = 0,
  excludeArticleIds?: number[]
): Promise<TrendingArticle[]> {
  const windowHours = getWindowHours(window);
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  
  // Build query conditions
  let query = db
    .select({
      trending: article_trending_scores,
      article: articles,
    })
    .from(article_trending_scores)
    .innerJoin(articles, eq(article_trending_scores.articleId, articles.id))
    .where(gte(article_trending_scores.windowStart, windowStart))
    .orderBy(desc(article_trending_scores.trendingScore))
    .limit(limit + (excludeArticleIds?.length || 0))
    .offset(offset);
  
  // Filter by category if specified
  if (categoryId) {
    query = query.where(
      and(
        gte(article_trending_scores.windowStart, windowStart),
        eq(article_trending_scores.categoryId, categoryId)
      )
    ) as any;
  }
  
  const results = await query;
  
  // Filter out excluded articles
  let filtered = results;
  if (excludeArticleIds && excludeArticleIds.length > 0) {
    const excludeSet = new Set(excludeArticleIds);
    filtered = results.filter(r => !excludeSet.has(r.article.id));
  }
  
  // Map to TrendingArticle format
  return filtered.slice(0, limit).map((r, index) => ({
    article: r.article,
    trendingScore: r.trending.trendingScore,
    viewVelocity: r.trending.viewVelocity,
    upvoteVelocity: r.trending.upvoteVelocity,
    commentVelocity: r.trending.commentVelocity,
    rank: offset + index + 1,
  }));
}

/**
 * Get personalized trending (exclude already read)
 */
export async function getPersonalizedTrending(
  userId: number,
  window: TimeWindow = '24h',
  limit: number = 20
): Promise<TrendingArticle[]> {
  // Get user's reading history
  const userInteractions = await db
    .select({ articleId: recommendation_interactions.articleId })
    .from(recommendation_interactions)
    .where(eq(recommendation_interactions.userId, userId));
  
  const readArticleIds = [...new Set(userInteractions.map(i => i.articleId))];
  
  // Get trending articles excluding read ones
  return getTrendingArticles(window, undefined, limit, 0, readArticleIds);
}

/**
 * Get trending by category
 */
export async function getTrendingByCategory(
  categoryId: number,
  window: TimeWindow = '7d',
  limit: number = 10
): Promise<TrendingArticle[]> {
  return getTrendingArticles(window, categoryId, limit);
}

/**
 * Simple trending for cold start (no pre-computed scores)
 * Fallback when trending scores haven't been calculated yet
 */
export async function getSimpleTrending(
  window: TimeWindow = '24h',
  limit: number = 20
): Promise<TrendingArticle[]> {
  const windowHours = getWindowHours(window);
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  
  // Get articles with recent views
  const recentViews = await db
    .select({
      articleId: page_views.articleId,
    })
    .from(page_views)
    .where(gte(page_views.createdAt, windowStart));
  
  // Count views per article
  const viewCounts = new Map<number, number>();
  for (const view of recentViews) {
    if (view.articleId) {
      const count = viewCounts.get(view.articleId) || 0;
      viewCounts.set(view.articleId, count + 1);
    }
  }
  
  // Get top articles by view count
  const topArticleIds = Array.from(viewCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
  
  if (topArticleIds.length === 0) {
    // Fallback to most popular by viewCount
    const popularArticles = await db
      .select()
      .from(articles)
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.viewCount))
      .limit(limit);
    
    return popularArticles.map((article, index) => ({
      article,
      trendingScore: article.viewCount || 0,
      viewVelocity: (article.viewCount || 0) / windowHours,
      upvoteVelocity: (article.upvotes || 0) / windowHours,
      commentVelocity: 0,
      rank: index + 1,
    }));
  }
  
  // Fetch article details
  const trendingArticles = await db
    .select()
    .from(articles)
    .where(inArray(articles.id, topArticleIds));
  
  const articleMap = new Map(trendingArticles.map(a => [a.id, a]));
  
  return topArticleIds
    .map((id, index) => {
      const article = articleMap.get(id);
      if (!article) return null;
      
      const viewCount = viewCounts.get(id) || 0;
      
      return {
        article,
        trendingScore: viewCount,
        viewVelocity: viewCount / windowHours,
        upvoteVelocity: (article.upvotes || 0) / windowHours,
        commentVelocity: 0,
        rank: index + 1,
      };
    })
    .filter((t): t is TrendingArticle => t !== null);
}
