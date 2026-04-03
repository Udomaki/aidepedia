import { db } from './index';
import { 
  user_recommendation_profiles,
  reading_history,
  recommendation_events,
  article_similarity_cache,
  user_similarity_cache,
  recommendation_metrics,
  articles,
  article_tags,
  tags,
  categories,
  bookmarks,
  article_reactions,
  article_user_votes
} from './schema/index';
import { eq, and, gte, desc, sql, inArray, not, between } from 'drizzle-orm';

// User profiling queries
export async function getUserProfile(userId: number) {
  return db()
    .select()
    .from(user_recommendation_profiles)
    .where(eq(user_recommendation_profiles.userId, userId))
    .limit(1)
    .then(rows => rows[0]);
}

export async function createUserProfile(userId: number) {
  const [profile] = await db()
    .insert(user_recommendation_profiles)
    .values({ userId })
    .returning();
  return profile;
}

export async function updateUserProfile(userId: number, data: Partial<typeof user_recommendation_profiles.$inferInsert>) {
  return db()
    .update(user_recommendation_profiles)
    .set(data)
    .where(eq(user_recommendation_profiles.userId, userId));
}

export async function getRecentReadingHistory(userId: number, daysAgo: number = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

  return db()
    .select({
      articleId: reading_history.articleId,
      readTime: reading_history.readTimeSeconds,
      scrollDepth: reading_history.scrollDepth,
      readAt: reading_history.readAt,
    })
    .from(reading_history)
    .where(and(
      eq(reading_history.userId, userId),
      gte(reading_history.readAt, cutoffDate)
    ))
    .orderBy(desc(reading_history.readAt))
    .limit(100);
}

export async function getArticleDetails(articleIds: number[]) {
  return db()
    .select({
      id: articles.id,
      categoryId: articles.categoryId,
      readingTime: articles.readingTime,
    })
    .from(articles)
    .where(inArray(articles.id, articleIds));
}

export async function getArticleTags(articleIds: number[]) {
  return db()
    .select({
      articleId: article_tags.articleId,
      tagId: article_tags.tagId,
      tagName: tags.name,
    })
    .from(article_tags)
    .innerJoin(tags, eq(article_tags.tagId, tags.id))
    .where(inArray(article_tags.articleId, articleIds));
}

export async function upsertReadingHistory(params: {
  userId: number;
  articleId: number;
  readTimeSeconds: number;
  scrollDepth: number;
}) {
  const { userId, articleId, readTimeSeconds, scrollDepth } = params;

  // Check for existing record
  const existing = await db()
    .select()
    .from(reading_history)
    .where(and(
      eq(reading_history.userId, userId),
      eq(reading_history.articleId, articleId)
    ))
    .orderBy(desc(reading_history.readAt))
    .limit(1)
    .then(rows => rows[0]);

  if (existing) {
    const newReadTime = Math.max(existing.readTimeSeconds || 0, readTimeSeconds);
    const newScrollDepth = Math.max(existing.scrollDepth || 0, scrollDepth);
    
    return db()
      .update(reading_history)
      .set({
        readTimeSeconds: newReadTime,
        scrollDepth: newScrollDepth,
        completed: scrollDepth >= 90,
        readAt: new Date(),
      })
      .where(eq(reading_history.id, existing.id));
  } else {
    return db()
      .insert(reading_history)
      .values({
        userId,
        articleId,
        readTimeSeconds,
        scrollDepth,
        completed: scrollDepth >= 90,
      });
  }
}

export async function getReadArticleIds(userId: number, daysAgo: number = 30): Promise<number[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

  const reads = await db()
    .select({ articleId: reading_history.articleId })
    .from(reading_history)
    .where(and(
      eq(reading_history.userId, userId),
      gte(reading_history.readAt, cutoffDate)
    ));

  return reads.map(r => r.articleId);
}

// Collaborative filtering queries
export async function getSimilarUsers(userId: number, limit: number = 20) {
  return db()
    .select({
      userId: user_similarity_cache.userId2,
      score: user_similarity_cache.similarityScore,
      computedAt: user_similarity_cache.computedAt,
    })
    .from(user_similarity_cache)
    .where(eq(user_similarity_cache.userId1, userId))
    .orderBy(desc(user_similarity_cache.similarityScore))
    .limit(limit);
}

export async function getUserReadingBySimilarUsers(userIds: number[], limit: number = 500) {
  return db()
    .select({
      articleId: reading_history.articleId,
      userId: reading_history.userId,
    })
    .from(reading_history)
    .where(inArray(reading_history.userId, userIds))
    .limit(limit);
}

export async function getUserBookmarks(userIds: number[], limit: number = 200) {
  return db()
    .select({
      articleId: bookmarks.articleId,
      userId: bookmarks.userId,
    })
    .from(bookmarks)
    .where(inArray(bookmarks.userId, userIds))
    .limit(limit);
}

export async function getUserVotes(userIds: number[], limit: number = 200) {
  return db()
    .select({
      articleId: article_user_votes.articleId,
      userId: article_user_votes.editorId,
      voteType: article_user_votes.voteType,
    })
    .from(article_user_votes)
    .where(inArray(article_user_votes.editorId, userIds))
    .limit(limit);
}

export async function getUserReactions(userIds: number[], limit: number = 200) {
  return db()
    .select({
      articleId: article_reactions.articleId,
      userId: article_reactions.userId,
    })
    .from(article_reactions)
    .where(inArray(article_reactions.userId, userIds))
    .limit(limit);
}

export async function getPopularArticles(limit: number) {
  return db()
    .select({
      id: articles.id,
      viewCount: articles.viewCount,
      upvotes: articles.upvotes,
    })
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(desc(articles.viewCount))
    .limit(limit);
}

export async function getArticlesForSimilarity(articleId: number, limit: number = 200) {
  return db()
    .select({
      id: articles.id,
      categoryId: articles.categoryId,
      qualityScore: articles.qualityScore,
    })
    .from(articles)
    .where(and(
      eq(articles.status, 'published'),
      not(eq(articles.id, articleId))
    ))
    .limit(limit);
}

export async function getSourceArticle(articleId: number) {
  return db()
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1)
    .then(rows => rows[0]);
}

export async function getSourceArticleTags(articleId: number) {
  return db()
    .select({ tagId: article_tags.tagId })
    .from(article_tags)
    .where(eq(article_tags.articleId, articleId));
}

// Content-based filtering queries
export async function getPublishedArticles(limit: number = 500) {
  return db()
    .select({
      id: articles.id,
      categoryId: articles.categoryId,
      qualityScore: articles.qualityScore,
      viewCount: articles.viewCount,
      upvotes: articles.upvotes,
      readingTime: articles.readingTime,
    })
    .from(articles)
    .where(eq(articles.status, 'published'))
    .limit(limit);
}

export async function getCachedSimilarArticles(articleId: number, limit: number) {
  return db()
    .select({
      articleId2: article_similarity_cache.articleId2,
      overallSimilarity: article_similarity_cache.overallSimilarity,
      categorySimilarity: article_similarity_cache.categorySimilarity,
      tagSimilarity: article_similarity_cache.tagSimilarity,
      contentSimilarity: article_similarity_cache.contentSimilarity,
    })
    .from(article_similarity_cache)
    .where(eq(article_similarity_cache.articleId1, articleId))
    .orderBy(desc(article_similarity_cache.overallSimilarity))
    .limit(limit);
}

// Recommendation tracking queries
export async function trackRecommendationDisplay(params: {
  articleId: number;
  placement: string;
  algorithm: string;
  userId?: number;
  visitorHash?: string;
  sourceArticleId?: number;
  experimentId?: number;
  variant?: string;
}) {
  const [event] = await db()
    .insert(recommendation_events)
    .values({
      ...params,
      displayed: true,
      clicked: false,
    })
    .returning();
  
  return event.id;
}

export async function trackRecommendationClick(eventId: number) {
  return db()
    .update(recommendation_events)
    .set({
      clicked: true,
      clickedAt: new Date(),
    })
    .where(eq(recommendation_events.id, eventId));
}

export async function trackRecommendationFeedback(eventId: number, helpful: boolean) {
  return db()
    .update(recommendation_events)
    .set({ helpful })
    .where(eq(recommendation_events.id, eventId));
}

// Metrics queries
export async function getRecommendationMetrics(startDate: Date) {
  return db()
    .select()
    .from(recommendation_metrics)
    .where(gte(recommendation_metrics.date, startDate))
    .orderBy(recommendation_metrics.date);
}

export async function upsertRecommendationMetrics(date: Date, data: any) {
  return db()
    .insert(recommendation_metrics)
    .values({
      date,
      ...data,
    })
    .onConflictDoUpdate({
      target: recommendation_metrics.date,
      set: data,
    });
}

export async function getRecommendationEvents(startOfDay: Date, endOfDay: Date) {
  return db()
    .select()
    .from(recommendation_events)
    .where(between(recommendation_events.createdAt, startOfDay, endOfDay));
}

// Article details for API responses
export async function getArticleDetailsForRecommendations(articleIds: number[]) {
  return db()
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      excerpt: articles.excerpt,
      categoryId: articles.categoryId,
      readingTime: articles.readingTime,
      viewCount: articles.viewCount,
      upvotes: articles.upvotes,
    })
    .from(articles)
    .where(inArray(articles.id, articleIds));
}

export async function getCategoryNames(categoryIds: number[]) {
  return db()
    .select({
      id: categories.id,
      name: categories.name,
    })
    .from(categories)
    .where(inArray(categories.id, categoryIds));
}

export async function getArticleTagsWithNames(articleIds: number[]) {
  return db()
    .select({
      articleId: article_tags.articleId,
      tagName: tags.name,
    })
    .from(article_tags)
    .innerJoin(tags, eq(article_tags.tagId, tags.id))
    .where(inArray(article_tags.articleId, articleIds));
}

export async function getArticleBySlug(slug: string) {
  return db()
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1)
    .then(rows => rows[0]);
}

// Engagement counts
export async function getBookmarkCount(userId: number) {
  return db()
    .select({ count: sql<number>`count(*)` })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId))
    .then(rows => rows[0]?.count || 0);
}

export async function getReactionCount(userId: number) {
  return db()
    .select({ count: sql<number>`count(*)` })
    .from(article_reactions)
    .where(eq(article_reactions.userId, userId))
    .then(rows => rows[0]?.count || 0);
}
