export type RecommendationPlacement = 'homepage' | 'article_related' | 'sidebar' | 'continue_reading';

export type RecommendationAlgorithm = 'collaborative' | 'content_based' | 'hybrid';

export interface RecommendationContext {
  userId?: number;
  visitorHash?: string;
  placement: RecommendationPlacement;
  sourceArticleId?: number; // For article-related recommendations
  limit?: number;
  algorithmOverride?: RecommendationAlgorithm;
}

export interface RecommendedArticle {
  articleId: number;
  score: number;
  algorithm: RecommendationAlgorithm;
  reason: string; // Human-readable reason for recommendation
}

export interface UserPreferences {
  categoryPreferences: Record<string, number>;
  tagPreferences: Record<string, number>;
  avgReadingTime: number;
  avgScrollDepth: number;
  preferredReadingTimes: Array<{ hour: number; count: number }>;
}

export interface ArticleFeatures {
  articleId: number;
  categoryId: number | null;
  tags: string[];
  qualityScore: number;
  viewCount: number;
  upvotes: number;
  readingTime: number;
}

export interface CollaborativeFilteringResult {
  articleId: number;
  score: number;
  similarUsers: number; // Number of similar users who read this
}

export interface ContentBasedResult {
  articleId: number;
  score: number;
  similarityBreakdown: {
    category: number;
    tags: number;
    quality: number;
  };
}

export interface HybridRecommendation {
  articleId: number;
  collaborativeScore: number;
  contentBasedScore: number;
  finalScore: number;
  algorithm: 'hybrid';
}
