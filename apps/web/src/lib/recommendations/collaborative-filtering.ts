import {
  getSimilarUsers,
  getUserReadingBySimilarUsers,
  getUserBookmarks,
  getUserVotes,
  getUserReactions,
  getPopularArticles,
} from '@aidepedia/db';
import type { CollaborativeFilteringResult } from './types';

export class CollaborativeFilteringService {
  /**
   * Find articles that similar users have read/enjoyed
   */
  async getRecommendations(
    userId: number,
    options: {
      limit?: number;
      excludeArticleIds?: Set<number>;
    } = {}
  ): Promise<CollaborativeFilteringResult[]> {
    const { limit = 10, excludeArticleIds = new Set() } = options;

    const similarUsers = await this.findSimilarUsers(userId, 20);

    if (similarUsers.length === 0) {
      return this.getPopularArticles(limit, excludeArticleIds);
    }

    const similarUserIds = similarUsers.map(u => u.userId);
    
    const articles = await getUserReadingBySimilarUsers(similarUserIds, 500);
    const bookmarked = await getUserBookmarks(similarUserIds, 200);
    const voted = await getUserVotes(similarUserIds, 200);
    const reacted = await getUserReactions(similarUserIds, 200);

    const articleScores = new Map<number, { score: number; userCount: number }>();

    for (const read of articles) {
      if (excludeArticleIds.has(read.articleId)) continue;
      
      const current = articleScores.get(read.articleId) || { score: 0, userCount: 0 };
      current.score += 1 * (similarUsers.find(u => u.userId === read.userId)?.weight || 1);
      current.userCount += 1;
      articleScores.set(read.articleId, current);
    }

    for (const bookmark of bookmarked) {
      if (excludeArticleIds.has(bookmark.articleId)) continue;
      
      const current = articleScores.get(bookmark.articleId) || { score: 0, userCount: 0 };
      current.score += 5 * (similarUsers.find(u => u.userId === bookmark.userId)?.weight || 1);
      current.userCount += 1;
      articleScores.set(bookmark.articleId, current);
    }

    for (const vote of voted) {
      if (excludeArticleIds.has(vote.articleId)) continue;
      
      const current = articleScores.get(vote.articleId) || { score: 0, userCount: 0 };
      const voteWeight = vote.voteType === 'upvote' ? 3 : -2;
      current.score += voteWeight * (similarUsers.find(u => u.userId === vote.userId)?.weight || 1);
      current.userCount += 1;
      articleScores.set(vote.articleId, current);
    }

    for (const reaction of reacted) {
      if (excludeArticleIds.has(reaction.articleId)) continue;
      
      const current = articleScores.get(reaction.articleId) || { score: 0, userCount: 0 };
      current.score += 2 * (similarUsers.find(u => u.userId === reaction.userId)?.weight || 1);
      current.userCount += 1;
      articleScores.set(reaction.articleId, current);
    }

    const results = Array.from(articleScores.entries())
      .map(([articleId, data]) => ({
        articleId,
        score: Math.round((data.score / data.userCount) * 10),
        similarUsers: data.userCount,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  }

  /**
   * Find similar users
   */
  private async findSimilarUsers(
    userId: number,
    limit: number
  ): Promise<Array<{ userId: number; weight: number }>> {
    const cached = await getSimilarUsers(userId, limit);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const freshCache = cached.filter(c => 
      c.computedAt && new Date(c.computedAt) > sevenDaysAgo
    );

    if (freshCache.length > 0) {
      return freshCache.map(c => ({
        userId: c.userId,
        weight: (c.score || 0) / 100,
      }));
    }

    return [];
  }

  /**
   * Fallback: Get popular articles
   */
  private async getPopularArticles(
    limit: number,
    excludeArticleIds: Set<number>
  ): Promise<CollaborativeFilteringResult[]> {
    const articles = await getPopularArticles(limit * 2);

    return articles
      .filter(a => !excludeArticleIds.has(a.id))
      .slice(0, limit)
      .map(a => ({
        articleId: a.id,
        score: Math.round((a.viewCount || 0) / 100 + (a.upvotes || 0) * 2),
        similarUsers: 0,
      }));
  }
}
