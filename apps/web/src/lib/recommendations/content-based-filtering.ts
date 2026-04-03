import {
  getPublishedArticles,
  getCachedSimilarArticles,
  getSourceArticle,
  getSourceArticleTags,
  getArticlesForSimilarity,
  getArticleTags,
} from '@aidepedia/db';
import type { ContentBasedResult, UserPreferences, ArticleFeatures } from './types';

export class ContentBasedFilteringService {
  /**
   * Get recommendations based on article similarity
   */
  async getRecommendations(
    preferences: UserPreferences,
    options: {
      limit?: number;
      excludeArticleIds?: Set<number>;
      sourceArticleId?: number;
    } = {}
  ): Promise<ContentBasedResult[]> {
    const { limit = 10, excludeArticleIds = new Set(), sourceArticleId } = options;

    if (sourceArticleId) {
      return this.getSimilarArticles(sourceArticleId, limit, excludeArticleIds);
    }

    const allArticles = await getPublishedArticles(500);

    const articleIds = allArticles.map(a => a.id);
    const articleTagData = await getArticleTags(articleIds);

    const articleFeatures = new Map<number, ArticleFeatures>();
    
    for (const article of allArticles) {
      if (excludeArticleIds.has(article.id)) continue;

      articleFeatures.set(article.id, {
        articleId: article.id,
        categoryId: article.categoryId,
        tags: [],
        qualityScore: article.qualityScore || 0,
        viewCount: article.viewCount || 0,
        upvotes: article.upvotes || 0,
        readingTime: article.readingTime || 1,
      });
    }

    for (const tagData of articleTagData) {
      const features = articleFeatures.get(tagData.articleId);
      if (features) {
        features.tags.push(tagData.tagId.toString());
      }
    }

    const scored: ContentBasedResult[] = [];

    for (const [articleId, features] of articleFeatures) {
      const score = this.calculateSimilarityScore(features, preferences);
      
      if (score.overall > 0) {
        scored.push({
          articleId,
          score: score.overall,
          similarityBreakdown: score.breakdown,
        });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get articles similar to a specific article
   */
  private async getSimilarArticles(
    articleId: number,
    limit: number,
    excludeArticleIds: Set<number>
  ): Promise<ContentBasedResult[]> {
    const cached = await getCachedSimilarArticles(articleId, limit * 2);

    const filtered = cached.filter(c => !excludeArticleIds.has(c.articleId2));

    if (filtered.length >= limit) {
      return filtered.slice(0, limit).map(c => ({
        articleId: c.articleId2,
        score: c.overallSimilarity || 0,
        similarityBreakdown: {
          category: c.categorySimilarity || 0,
          tags: c.tagSimilarity || 0,
          quality: c.contentSimilarity || 0,
        },
      }));
    }

    return this.computeSimilarArticles(articleId, limit, excludeArticleIds);
  }

  /**
   * Compute article similarity scores
   */
  private async computeSimilarArticles(
    articleId: number,
    limit: number,
    excludeArticleIds: Set<number>
  ): Promise<ContentBasedResult[]> {
    const sourceArticle = await getSourceArticle(articleId);

    if (!sourceArticle) {
      return [];
    }

    const sourceTags = await getSourceArticleTags(articleId);
    const sourceTagIds = new Set(sourceTags.map(t => t.tagId));

    const candidates = await getArticlesForSimilarity(articleId, 200);

    const candidateIds = candidates.map(c => c.id);
    const candidateTagData = await getArticleTags(candidateIds);

    const candidateTags = new Map<number, Set<number>>();
    for (const tag of candidateTagData) {
      if (!candidateTags.has(tag.articleId)) {
        candidateTags.set(tag.articleId, new Set());
      }
      candidateTags.get(tag.articleId)!.add(tag.tagId);
    }

    const scored: ContentBasedResult[] = [];

    for (const candidate of candidates) {
      if (excludeArticleIds.has(candidate.id)) continue;

      const categorySimilarity = candidate.categoryId === sourceArticle.categoryId ? 100 : 0;

      const candidateTagSet = candidateTags.get(candidate.id) || new Set();
      const tagIntersection = new Set(
        Array.from(sourceTagIds).filter(x => candidateTagSet.has(x))
      ).size;
      const tagUnion = new Set([
        ...Array.from(sourceTagIds),
        ...Array.from(candidateTagSet)
      ]).size;
      const tagSimilarity = tagUnion > 0 ? Math.round((tagIntersection / tagUnion) * 100) : 0;

      const qualityDiff = Math.abs(
        (candidate.qualityScore || 0) - (sourceArticle.qualityScore || 0)
      );
      const contentSimilarity = Math.max(0, 100 - qualityDiff);

      const overallScore = Math.round(
        categorySimilarity * 0.4 + tagSimilarity * 0.4 + contentSimilarity * 0.2
      );

      if (overallScore > 0) {
        scored.push({
          articleId: candidate.id,
          score: overallScore,
          similarityBreakdown: {
            category: categorySimilarity,
            tags: tagSimilarity,
            quality: contentSimilarity,
          },
        });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Calculate similarity between article features and user preferences
   */
  private calculateSimilarityScore(
    features: ArticleFeatures,
    preferences: UserPreferences
  ): { overall: number; breakdown: { category: number; tags: number; quality: number } } {
    let categoryScore = 0;
    if (features.categoryId) {
      categoryScore = preferences.categoryPreferences[features.categoryId.toString()] || 0;
    }

    let tagScore = 0;
    if (features.tags.length > 0) {
      const tagScores = features.tags
        .map(tagId => preferences.tagPreferences[tagId] || 0)
        .filter(score => score > 0);
      
      if (tagScores.length > 0) {
        tagScore = Math.round(
          tagScores.reduce((a, b) => a + b, 0) / tagScores.length
        );
      }
    }

    const qualityScore = Math.min(100, (features.qualityScore / 10) * 100);

    let readingTimeScore = 50;
    if (preferences.avgReadingTime > 0) {
      const readingTimeDiff = Math.abs(
        features.readingTime * 60 - preferences.avgReadingTime
      );
      readingTimeScore = Math.max(0, 100 - readingTimeDiff / 10);
    }

    const overallScore = Math.round(
      categoryScore * 0.3 +
      tagScore * 0.3 +
      qualityScore * 0.2 +
      readingTimeScore * 0.2
    );

    return {
      overall: overallScore,
      breakdown: {
        category: categoryScore,
        tags: tagScore,
        quality: qualityScore,
      },
    };
  }
}
