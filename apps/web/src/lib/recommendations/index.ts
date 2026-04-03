import { HybridRecommenderService } from './hybrid-recommender';
import { UserProfilingService } from './user-profiling';
import { RecommendationAnalyticsService } from './recommendation-analytics';
import { db } from '@aidepedia/db';
import { articles, categories, article_tags, tags } from '@aidepedia/db/schema';
import { inArray, eq } from 'drizzle-orm';
import type { RecommendationContext, RecommendedArticle, RecommendationPlacement } from './types';

export class RecommendationService {
  private hybridRecommender: HybridRecommenderService;
  private userProfiling: UserProfilingService;
  private analytics: RecommendationAnalyticsService;

  constructor() {
    this.hybridRecommender = new HybridRecommenderService();
    this.userProfiling = new UserProfilingService();
    this.analytics = new RecommendationAnalyticsService();
  }

  /**
   * Get personalized recommendations for a user
   */
  async getPersonalizedFeed(params: {
    userId?: number;
    visitorHash?: string;
    placement: RecommendationPlacement;
    limit?: number;
    sourceArticleId?: number;
  }): Promise<Array<RecommendedArticle & {
    title: string;
    slug: string;
    excerpt: string | null;
    categoryId: number | null;
    categoryName: string | null;
    readingTime: number;
    viewCount: number;
    upvotes: number;
    tags: string[];
  }>> {
    const { userId, visitorHash, placement, limit = 10, sourceArticleId } = params;

    // Get recommendations
    const context: RecommendationContext = {
      userId,
      visitorHash,
      placement,
      sourceArticleId,
      limit,
    };

    const recommendations = await this.hybridRecommender.getRecommendations(context);

    if (recommendations.length === 0) {
      return [];
    }

    // Fetch article details
    const articleIds = recommendations.map(r => r.articleId);
    
    const articleDetails = await db()
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

    // Get category names
    const categoryIds = [
      ...new Set(articleDetails.map(a => a.categoryId).filter(Boolean))
    ] as number[];
    
    const categoryDetails = await db()
      .select({
        id: categories.id,
        name: categories.name,
      })
      .from(categories)
      .where(inArray(categories.id, categoryIds));

    const categoryMap = new Map(categoryDetails.map(c => [c.id, c.name]));

    // Get tags for articles
    const articleTagData = await db()
      .select({
        articleId: article_tags.articleId,
        tagName: tags.name,
      })
      .from(article_tags)
      .innerJoin(tags, eq(article_tags.tagId, tags.id))
      .where(inArray(article_tags.articleId, articleIds));

    // Build tag map
    const articleTagMap = new Map<number, string[]>();
    for (const tag of articleTagData) {
      if (!articleTagMap.has(tag.articleId)) {
        articleTagMap.set(tag.articleId, []);
      }
      articleTagMap.get(tag.articleId)!.push(tag.tagName);
    }

    // Build article map
    const articleMap = new Map(articleDetails.map(a => [a.id, a]));

    // Combine recommendations with article details
    const results = recommendations.map(rec => {
      const article = articleMap.get(rec.articleId);
      
      if (!article) {
        return null;
      }

      // Track recommendation display
      this.analytics.trackDisplay({
        articleId: rec.articleId,
        placement,
        algorithm: rec.algorithm,
        userId,
        visitorHash,
        sourceArticleId,
      }).catch(err => {
        console.error('Failed to track recommendation display:', err);
      });

      return {
        ...rec,
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt,
        categoryId: article.categoryId,
        categoryName: article.categoryId ? categoryMap.get(article.categoryId) || null : null,
        readingTime: article.readingTime || 1,
        viewCount: article.viewCount || 0,
        upvotes: article.upvotes || 0,
        tags: articleTagMap.get(rec.articleId) || [],
      };
    }).filter(Boolean) as Array<RecommendedArticle & {
      title: string;
      slug: string;
      excerpt: string | null;
      categoryId: number | null;
      categoryName: string | null;
      readingTime: number;
      viewCount: number;
      upvotes: number;
      tags: string[];
    }>;

    return results;
  }

  /**
   * Get similar articles to a given article
   */
  async getSimilarArticles(articleId: number, params: {
    userId?: number;
    visitorHash?: string;
    limit?: number;
  }) {
    return this.getPersonalizedFeed({
      ...params,
      placement: 'article_related',
      sourceArticleId: articleId,
      limit: params.limit || 5,
    });
  }

  /**
   * Track when a user reads an article (for future recommendations)
   */
  async trackReading(params: {
    userId?: number;
    articleId: number;
    readTimeSeconds?: number;
    scrollDepth?: number;
  }): Promise<void> {
    await this.userProfiling.trackReading(params);

    // Update user profile periodically (not on every read to avoid performance issues)
    if (params.userId && Math.random() < 0.1) { // 10% chance to update profile
      this.userProfiling.updateUserProfile(params.userId).catch(err => {
        console.error('Failed to update user profile:', err);
      });
    }
  }

  /**
   * Track recommendation click
   */
  async trackRecommendationClick(eventId: number): Promise<void> {
    await this.analytics.trackClick(eventId);
  }

  /**
   * Track recommendation feedback
   */
  async trackRecommendationFeedback(eventId: number, helpful: boolean): Promise<void> {
    await this.analytics.trackFeedback(eventId, helpful);
  }

  /**
   * Get recommendation performance metrics
   */
  async getPerformanceMetrics(days: number = 30) {
    return this.analytics.getPerformanceMetrics(days);
  }
}

// Export singleton instance
export const recommendationService = new RecommendationService();

// Export all classes for testing
export { HybridRecommenderService } from './hybrid-recommender';
export { UserProfilingService } from './user-profiling';
export { CollaborativeFilteringService } from './collaborative-filtering';
export { ContentBasedFilteringService } from './content-based-filtering';
export { RecommendationAnalyticsService } from './recommendation-analytics';
export * from './types';
