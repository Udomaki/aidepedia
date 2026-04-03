import {
  getUserProfile,
  createUserProfile,
  updateUserProfile,
  getRecentReadingHistory,
  getArticleDetails,
  getArticleTags,
  upsertReadingHistory,
  getReadArticleIds,
  getBookmarkCount,
  getReactionCount,
} from '@aidepedia/db';
import type { UserPreferences } from './types';

export class UserProfilingService {
  /**
   * Get or create a user's recommendation profile
   */
  async getUserProfile(userId: number) {
    let profile = await getUserProfile(userId);

    if (!profile) {
      profile = await createUserProfile(userId);
    }

    return profile;
  }

  /**
   * Update user profile based on their recent activity
   */
  async updateUserProfile(userId: number): Promise<void> {
    const recentReads = await getRecentReadingHistory(userId, 30);

    if (recentReads.length === 0) {
      return;
    }

    const articleIds = [...new Set(recentReads.map(r => r.articleId))];
    const articlesWithDetails = await getArticleDetails(articleIds);
    const articleTagData = await getArticleTags(articleIds);

    const articleMap = new Map(articlesWithDetails.map(a => [a.id, a]));
    
    const categoryPreferences: Record<string, number> = {};
    const tagPreferences: Record<string, number> = {};
    const readingTimes: number[] = [];
    const scrollDepths: number[] = [];
    const hourlyActivity: Record<number, number> = {};

    for (const read of recentReads) {
      const article = articleMap.get(read.articleId);
      if (!article) continue;

      if (article.categoryId) {
        const catId = article.categoryId.toString();
        categoryPreferences[catId] = (categoryPreferences[catId] || 0) + 1;
      }

      if (read.readTime) readingTimes.push(read.readTime);
      if (read.scrollDepth) scrollDepths.push(read.scrollDepth);

      if (read.readAt) {
        const hour = new Date(read.readAt).getHours();
        hourlyActivity[hour] = (hourlyActivity[hour] || 0) + 1;
      }
    }

    for (const articleTag of articleTagData) {
      const tagId = articleTag.tagId.toString();
      tagPreferences[tagId] = (tagPreferences[tagId] || 0) + 1;
    }

    const maxCategoryCount = Math.max(...Object.values(categoryPreferences), 1);
    const maxTagCount = Math.max(...Object.values(tagPreferences), 1);

    Object.keys(categoryPreferences).forEach(key => {
      categoryPreferences[key] = Math.round((categoryPreferences[key] / maxCategoryCount) * 100);
    });

    Object.keys(tagPreferences).forEach(key => {
      tagPreferences[key] = Math.round((tagPreferences[key] / maxTagCount) * 100);
    });

    const avgReadingTime = readingTimes.length > 0
      ? Math.round(readingTimes.reduce((a, b) => a + b, 0) / readingTimes.length)
      : 0;

    const avgScrollDepth = scrollDepths.length > 0
      ? Math.round(scrollDepths.reduce((a, b) => a + b, 0) / scrollDepths.length)
      : 0;

    const preferredReadingTimes = Object.entries(hourlyActivity)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const bookmarkCount = await getBookmarkCount(userId);
    const reactionCount = await getReactionCount(userId);

    await updateUserProfile(userId, {
      categoryPreferences,
      tagPreferences,
      avgReadingTime,
      avgScrollDepth,
      preferredReadingTimes,
      totalArticlesRead: recentReads.length,
      totalBookmarks: bookmarkCount,
      totalReactions: reactionCount,
      lastUpdated: new Date(),
    });
  }

  /**
   * Track a reading event
   */
  async trackReading(params: {
    userId?: number;
    articleId: number;
    readTimeSeconds?: number;
    scrollDepth?: number;
  }): Promise<void> {
    const { userId, articleId, readTimeSeconds = 0, scrollDepth = 0 } = params;

    if (!userId) return;

    await upsertReadingHistory({
      userId,
      articleId,
      readTimeSeconds,
      scrollDepth,
    });
  }

  /**
   * Get user preferences for recommendations
   */
  async getUserPreferences(userId: number): Promise<UserPreferences | null> {
    const profile = await this.getUserProfile(userId);

    return {
      categoryPreferences: (profile.categoryPreferences as Record<string, number>) || {},
      tagPreferences: (profile.tagPreferences as Record<string, number>) || {},
      avgReadingTime: profile.avgReadingTime || 0,
      avgScrollDepth: profile.avgScrollDepth || 0,
      preferredReadingTimes: (profile.preferredReadingTimes as Array<{ hour: number; count: number }>) || [],
    };
  }

  /**
   * Get articles the user has already read
   */
  async getReadArticleIds(userId: number, daysAgo: number = 30): Promise<Set<number>> {
    const articleIds = await getReadArticleIds(userId, daysAgo);
    return new Set(articleIds);
  }
}
