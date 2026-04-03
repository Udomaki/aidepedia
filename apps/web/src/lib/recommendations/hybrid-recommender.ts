import { UserProfilingService } from './user-profiling';
import { CollaborativeFilteringService } from './collaborative-filtering';
import { ContentBasedFilteringService } from './content-based-filtering';
import type { 
  RecommendationContext, 
  RecommendedArticle,
  HybridRecommendation,
  RecommendationAlgorithm 
} from './types';

export class HybridRecommenderService {
  private userProfiling: UserProfilingService;
  private collaborative: CollaborativeFilteringService;
  private contentBased: ContentBasedFilteringService;

  constructor() {
    this.userProfiling = new UserProfilingService();
    this.collaborative = new CollaborativeFilteringService();
    this.contentBased = new ContentBasedFilteringService();
  }

  /**
   * Get hybrid recommendations combining collaborative and content-based filtering
   */
  async getRecommendations(
    context: RecommendationContext
  ): Promise<RecommendedArticle[]> {
    const {
      userId,
      placement,
      sourceArticleId,
      limit = 10,
      algorithmOverride,
    } = context;

    // Determine which algorithm to use
    const algorithm = algorithmOverride || this.selectAlgorithm(placement, userId);

    // Get excluded articles (already read)
    let excludeArticleIds = new Set<number>();
    if (userId) {
      excludeArticleIds = await this.userProfiling.getReadArticleIds(userId);
    }

    // If source article provided, exclude it too
    if (sourceArticleId) {
      excludeArticleIds.add(sourceArticleId);
    }

    let recommendations: RecommendedArticle[] = [];

    switch (algorithm) {
      case 'collaborative':
        recommendations = await this.getCollaborativeRecommendations(
          userId,
          limit,
          excludeArticleIds
        );
        break;

      case 'content_based':
        recommendations = await this.getContentBasedRecommendations(
          userId,
          limit,
          excludeArticleIds,
          sourceArticleId
        );
        break;

      case 'hybrid':
      default:
        recommendations = await this.getHybridRecommendations(
          userId,
          limit,
          excludeArticleIds,
          sourceArticleId
        );
        break;
    }

    return recommendations;
  }

  /**
   * Select the best algorithm based on context and user data
   */
  private selectAlgorithm(
    placement: string,
    userId?: number
  ): RecommendationAlgorithm {
    // For article-related placements, prefer content-based
    if (placement === 'article_related' || placement === 'continue_reading') {
      return 'content_based';
    }

    // For homepage with logged-in user, use hybrid
    if (placement === 'homepage' && userId) {
      return 'hybrid';
    }

    // Default to hybrid for logged-in users, content-based for anonymous
    return userId ? 'hybrid' : 'content_based';
  }

  /**
   * Get collaborative filtering recommendations
   */
  private async getCollaborativeRecommendations(
    userId: number | undefined,
    limit: number,
    excludeArticleIds: Set<number>
  ): Promise<RecommendedArticle[]> {
    if (!userId) {
      return []; // Collaborative filtering requires logged-in user
    }

    const results = await this.collaborative.getRecommendations(userId, {
      limit,
      excludeArticleIds,
    });

    return results.map(r => ({
      articleId: r.articleId,
      score: r.score,
      algorithm: 'collaborative' as const,
      reason: r.similarUsers > 0
        ? `Popular with ${r.similarUsers} similar readers`
        : 'Trending article',
    }));
  }

  /**
   * Get content-based recommendations
   */
  private async getContentBasedRecommendations(
    userId: number | undefined,
    limit: number,
    excludeArticleIds: Set<number>,
    sourceArticleId?: number
  ): Promise<RecommendedArticle[]> {
    let preferences;

    if (userId) {
      preferences = await this.userProfiling.getUserPreferences(userId);
    }

    // If no preferences or source article provided, use popular articles
    if (!preferences && !sourceArticleId) {
      const popular = await this.collaborative.getRecommendations(userId || 0, {
        limit,
        excludeArticleIds,
      });

      return popular.map(r => ({
        articleId: r.articleId,
        score: r.score,
        algorithm: 'content_based' as const,
        reason: 'Popular article',
      }));
    }

    const results = await this.contentBased.getRecommendations(
      preferences || {
        categoryPreferences: {},
        tagPreferences: {},
        avgReadingTime: 0,
        avgScrollDepth: 0,
        preferredReadingTimes: [],
      },
      {
        limit,
        excludeArticleIds,
        sourceArticleId,
      }
    );

    return results.map(r => {
      let reason = 'Recommended for you';
      
      if (sourceArticleId) {
        reason = 'Related article';
      } else if (r.similarityBreakdown.tags > 70) {
        reason = 'Matches your interests';
      } else if (r.similarityBreakdown.category > 70) {
        reason = 'In your favorite category';
      } else if (r.similarityBreakdown.quality > 80) {
        reason = 'High-quality article';
      }

      return {
        articleId: r.articleId,
        score: r.score,
        algorithm: 'content_based' as const,
        reason,
      };
    });
  }

  /**
   * Get hybrid recommendations combining both approaches
   */
  private async getHybridRecommendations(
    userId: number | undefined,
    limit: number,
    excludeArticleIds: Set<number>,
    sourceArticleId?: number
  ): Promise<RecommendedArticle[]> {
    if (!userId) {
      // Fall back to content-based for anonymous users
      return this.getContentBasedRecommendations(
        userId,
        limit,
        excludeArticleIds,
        sourceArticleId
      );
    }

    // Get user profile for weights
    const profile = await this.userProfiling.getUserProfile(userId);
    
    // Use user's preferred weights or defaults
    const collaborativeWeight = (profile.collaborativeWeight || 50) / 100;
    const contentBasedWeight = (profile.contentBasedWeight || 50) / 100;

    // Get recommendations from both algorithms
    const [collabResults, contentResults] = await Promise.all([
      this.collaborative.getRecommendations(userId, {
        limit: limit * 2, // Get more to allow for combination
        excludeArticleIds,
      }),
      this.userProfiling.getUserPreferences(userId).then(prefs => 
        this.contentBased.getRecommendations(prefs!, {
          limit: limit * 2,
          excludeArticleIds,
          sourceArticleId,
        })
      ),
    ]);

    // Combine scores
    const combinedScores = new Map<number, HybridRecommendation>();

    // Add collaborative scores
    for (const result of collabResults) {
      combinedScores.set(result.articleId, {
        articleId: result.articleId,
        collaborativeScore: result.score,
        contentBasedScore: 0,
        finalScore: result.score * collaborativeWeight,
        algorithm: 'hybrid',
      });
    }

    // Add and combine content-based scores
    for (const result of contentResults) {
      const existing = combinedScores.get(result.articleId);
      
      if (existing) {
        // Article appears in both - combine scores
        existing.contentBasedScore = result.score;
        existing.finalScore = 
          existing.collaborativeScore * collaborativeWeight +
          result.score * contentBasedWeight;
      } else {
        // Article only in content-based
        combinedScores.set(result.articleId, {
          articleId: result.articleId,
          collaborativeScore: 0,
          contentBasedScore: result.score,
          finalScore: result.score * contentBasedWeight,
          algorithm: 'hybrid',
        });
      }
    }

    // Sort by final score and generate reasons
    const sorted = Array.from(combinedScores.values())
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);

    return sorted.map(rec => {
      let reason = 'Recommended for you';

      // Generate more specific reasons based on score composition
      if (rec.collaborativeScore > 0 && rec.contentBasedScore > 0) {
        reason = 'Perfect match for your interests';
      } else if (rec.collaborativeScore > rec.contentBasedScore) {
        reason = 'Popular with similar readers';
      } else if (rec.contentBasedScore > 0) {
        const contentRec = contentResults.find(r => r.articleId === rec.articleId);
        if (contentRec?.similarityBreakdown.tags > 70) {
          reason = 'Matches your interests';
        } else if (contentRec?.similarityBreakdown.category > 70) {
          reason = 'In your favorite category';
        }
      }

      return {
        articleId: rec.articleId,
        score: Math.round(rec.finalScore),
        algorithm: 'hybrid' as const,
        reason,
      };
    });
  }
}
