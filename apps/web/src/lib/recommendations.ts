/**
 * Intelligent Content Recommendations Service
 * 
 * Implements personalized recommendations using:
 * - Collaborative filtering (user behavior patterns)
 * - Content-based filtering (article features)
 * - Hybrid scoring (combining both approaches)
 */

import { db, eq, desc, inArray, sql, and, not, gte } from '@aidepedia/db';
import { 
  articles, 
  users, 
  article_tags, 
  tags,
  user_embeddings,
  article_embeddings,
  recommendation_interactions,
  related_articles_cache
} from '@aidepedia/db/schema';

// Types
export interface RecommendationResult {
  article: typeof articles.$inferSelect;
  score: number;
  reason: string;
  components: {
    collaborative: number;
    contentBased: number;
    popularity: number;
    recency: number;
  };
}

export interface UserPreferences {
  preferredCategories: Map<number, number>; // categoryId -> weight
  preferredTags: Map<number, number>; // tagId -> weight
  readingHistory: Set<number>; // articleIds
}

// Interaction strength weights
const INTERACTION_WEIGHTS = {
  view: 1,
  read: 2,
  bookmark: 3,
  upvote: 4,
  share: 5,
  comment: 6,
};

// Time decay factor (how much to weight recent interactions)
const TIME_DECAY_FACTOR = 0.95; // Per day

/**
 * Track a user interaction with an article
 */
export async function trackInteraction(
  userId: number,
  articleId: number,
  interactionType: 'view' | 'read' | 'bookmark' | 'upvote' | 'share' | 'comment',
  metadata?: {
    timeOnPage?: number;
    scrollDepth?: number;
    source?: string;
  }
): Promise<void> {
  try {
    await db.insert(recommendation_interactions).values({
      userId,
      articleId,
      interactionType,
      strength: INTERACTION_WEIGHTS[interactionType],
      timeOnPage: metadata?.timeOnPage,
      scrollDepth: metadata?.scrollDepth,
      source: metadata?.source || 'direct',
    });
  } catch (error) {
    console.error('Failed to track interaction:', error);
    // Don't throw - tracking failures shouldn't break user experience
  }
}

/**
 * Get user's reading preferences based on interaction history
 */
export async function getUserPreferences(userId: number): Promise<UserPreferences> {
  // Get user's interactions from last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const interactions = await db
    .select({
      articleId: recommendation_interactions.articleId,
      strength: recommendation_interactions.strength,
      createdAt: recommendation_interactions.createdAt,
      categoryId: articles.categoryId,
    })
    .from(recommendation_interactions)
    .innerJoin(articles, eq(recommendation_interactions.articleId, articles.id))
    .where(and(
      eq(recommendation_interactions.userId, userId),
      gte(recommendation_interactions.createdAt, ninetyDaysAgo)
    ));
  
  // Calculate category preferences with time decay
  const preferredCategories = new Map<number, number>();
  const readingHistory = new Set<number>();
  
  for (const interaction of interactions) {
    if (interaction.categoryId) {
      const daysAgo = Math.floor((Date.now() - interaction.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const decayedStrength = interaction.strength * Math.pow(TIME_DECAY_FACTOR, daysAgo);
      
      const current = preferredCategories.get(interaction.categoryId) || 0;
      preferredCategories.set(interaction.categoryId, current + decayedStrength);
    }
    readingHistory.add(interaction.articleId);
  }
  
  // Get tag preferences
  const articleIds = Array.from(readingHistory);
  const preferredTags = new Map<number, number>();
  
  if (articleIds.length > 0) {
    const articleTagsData = await db
      .select({
        tagId: article_tags.tagId,
        articleId: article_tags.articleId,
      })
      .from(article_tags)
      .where(inArray(article_tags.articleId, articleIds));
    
    // Get interaction strengths for articles
    const interactionMap = new Map<number, number>();
    for (const interaction of interactions) {
      const current = interactionMap.get(interaction.articleId) || 0;
      interactionMap.set(interaction.articleId, current + interaction.strength);
    }
    
    // Aggregate tag weights
    for (const at of articleTagsData) {
      const articleWeight = interactionMap.get(at.articleId) || 1;
      const current = preferredTags.get(at.tagId) || 0;
      preferredTags.set(at.tagId, current + articleWeight);
    }
  }
  
  return {
    preferredCategories,
    preferredTags,
    readingHistory,
  };
}

/**
 * Calculate content-based similarity score
 */
async function calculateContentBasedScore(
  article: typeof articles.$inferSelect,
  preferences: UserPreferences
): Promise<number> {
  let score = 0;
  
  // Category match (0-40 points)
  if (article.categoryId && preferences.preferredCategories.has(article.categoryId)) {
    const categoryWeight = preferences.preferredCategories.get(article.categoryId)!;
    const maxCategoryWeight = Math.max(...Array.from(preferences.preferredCategories.values()));
    score += 40 * (categoryWeight / maxCategoryWeight);
  }
  
  // Tag overlap (0-40 points)
  const articleTagsData = await db
    .select({ tagId: article_tags.tagId })
    .from(article_tags)
    .where(eq(article_tags.articleId, article.id));
  
  if (articleTagsData.length > 0 && preferences.preferredTags.size > 0) {
    let tagScore = 0;
    const maxTagWeight = Math.max(...Array.from(preferences.preferredTags.values()));
    
    for (const at of articleTagsData) {
      if (preferences.preferredTags.has(at.tagId)) {
        const tagWeight = preferences.preferredTags.get(at.tagId)!;
        tagScore += tagWeight / maxTagWeight;
      }
    }
    
    // Normalize by number of tags
    const normalizedTagScore = tagScore / articleTagsData.length;
    score += 40 * normalizedTagScore;
  }
  
  // Quality score (0-20 points)
  if (article.qualityScore && article.qualityScore > 0) {
    score += 20 * Math.min(article.qualityScore / 100, 1);
  }
  
  return score;
}

/**
 * Calculate collaborative filtering score
 * Simplified version: "users who read this also read..."
 */
async function calculateCollaborativeScore(
  articleId: number,
  userId: number
): Promise<number> {
  // Find users who read this article
  const otherUsers = await db
    .select({ userId: recommendation_interactions.userId })
    .from(recommendation_interactions)
    .where(and(
      eq(recommendation_interactions.articleId, articleId),
      not(eq(recommendation_interactions.userId, userId))
    ))
    .limit(100);
  
  if (otherUsers.length === 0) return 0;
  
  // Check how many articles the current user has in common with these users
  const otherUserIds = [...new Set(otherUsers.map(u => u.userId))];
  
  // Get articles read by similar users
  const similarUsersArticles = await db
    .select({ articleId: recommendation_interactions.articleId })
    .from(recommendation_interactions)
    .where(inArray(recommendation_interactions.userId, otherUserIds));
  
  // Get current user's articles
  const currentUserArticles = await db
    .select({ articleId: recommendation_interactions.articleId })
    .from(recommendation_interactions)
    .where(eq(recommendation_interactions.userId, userId));
  
  const currentUserArticleIds = new Set(currentUserArticles.map(a => a.articleId));
  
  // Calculate overlap
  let overlapCount = 0;
  const uniqueArticles = new Set(similarUsersArticles.map(a => a.articleId));
  
  for (const articleId of uniqueArticles) {
    if (currentUserArticleIds.has(articleId)) {
      overlapCount++;
    }
  }
  
  // Normalize score (0-100)
  const overlapRatio = uniqueArticles.size > 0 ? overlapCount / uniqueArticles.size : 0;
  return 100 * overlapRatio;
}

/**
 * Calculate popularity score
 */
function calculatePopularityScore(article: typeof articles.$inferSelect): number {
  let score = 0;
  
  // View count contribution (0-30 points)
  if (article.viewCount && article.viewCount > 0) {
    score += 30 * Math.min(article.viewCount / 10000, 1);
  }
  
  // Upvote contribution (0-50 points)
  const totalVotes = (article.upvotes || 0) + (article.downvotes || 0);
  if (totalVotes > 0) {
    const upvoteRatio = article.upvotes / totalVotes;
    score += 50 * upvoteRatio * Math.min(totalVotes / 100, 1);
  }
  
  // Recency contribution (0-20 points)
  if (article.publishedAt) {
    const daysSincePublication = Math.floor(
      (Date.now() - article.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSincePublication < 30) {
      score += 20 * (1 - daysSincePublication / 30);
    }
  }
  
  return score;
}

/**
 * Calculate recency bonus
 */
function calculateRecencyBonus(article: typeof articles.$inferSelect): number {
  if (!article.publishedAt) return 0;
  
  const daysSincePublication = Math.floor(
    (Date.now() - article.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSincePublication < 7) {
    return 20 * (1 - daysSincePublication / 7);
  } else if (daysSincePublication < 30) {
    return 10 * (1 - (daysSincePublication - 7) / 23);
  }
  
  return 0;
}

/**
 * Get personalized recommendations for a user
 */
export async function getPersonalizedRecommendations(
  userId: number,
  limit: number = 20,
  offset: number = 0
): Promise<RecommendationResult[]> {
  // Get user preferences
  const preferences = await getUserPreferences(userId);
  
  // Get candidate articles (published, not already read)
  const candidateArticles = await db
    .select()
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(desc(articles.publishedAt))
    .limit(100);
  
  // Filter out already read articles
  const unreadArticles = candidateArticles.filter(
    article => !preferences.readingHistory.has(article.id)
  );
  
  // Calculate scores for each article
  const recommendations: RecommendationResult[] = [];
  
  for (const article of unreadArticles.slice(0, 50)) { // Limit for performance
    const [contentScore, collaborativeScore] = await Promise.all([
      calculateContentBasedScore(article, preferences),
      calculateCollaborativeScore(article.id, userId),
    ]);
    
    const popularityScore = calculatePopularityScore(article);
    const recencyScore = calculateRecencyBonus(article);
    
    // Hybrid scoring (weighted combination)
    const totalScore = 
      contentScore * 0.35 + 
      collaborativeScore * 0.35 + 
      popularityScore * 0.2 + 
      recencyScore * 0.1;
    
    // Determine primary reason
    let reason = 'Recommended for you';
    if (contentScore > collaborativeScore && contentScore > popularityScore) {
      reason = 'Based on your reading history';
    } else if (collaborativeScore > popularityScore) {
      reason = 'Readers like you also enjoyed';
    } else if (popularityScore > 50) {
      reason = 'Popular in the community';
    }
    
    recommendations.push({
      article,
      score: totalScore,
      reason,
      components: {
        collaborative: collaborativeScore,
        contentBased: contentScore,
        popularity: popularityScore,
        recency: recencyScore,
      },
    });
  }
  
  // Sort by score and paginate
  recommendations.sort((a, b) => b.score - a.score);
  
  return recommendations.slice(offset, offset + limit);
}

/**
 * Get related articles for a specific article
 */
export async function getRelatedArticles(
  articleId: number,
  userId?: number,
  limit: number = 10
): Promise<RecommendationResult[]> {
  // Check cache first
  const cached = await db
    .select({
      relatedArticleId: related_articles_cache.relatedArticleId,
      similarityScore: related_articles_cache.similarityScore,
    })
    .from(related_articles_cache)
    .where(eq(related_articles_cache.articleId, articleId))
    .orderBy(desc(related_articles_cache.similarityScore))
    .limit(limit);
  
  if (cached.length > 0) {
    // Fetch full article data
    const relatedIds = cached.map(c => c.relatedArticleId);
    const relatedArticlesData = await db
      .select()
      .from(articles)
      .where(and(
        inArray(articles.id, relatedIds),
        eq(articles.status, 'published')
      ));
    
    const articleMap = new Map(relatedArticlesData.map(a => [a.id, a]));
    
    return cached
      .filter(c => articleMap.has(c.relatedArticleId))
      .map(c => ({
        article: articleMap.get(c.relatedArticleId)!,
        score: c.similarityScore,
        reason: 'Related to this article',
        components: {
          collaborative: 0,
          contentBased: c.similarityScore,
          popularity: 0,
          recency: 0,
        },
      }));
  }
  
  // Calculate related articles on-the-fly
  const sourceArticle = await db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);
  
  if (sourceArticle.length === 0) return [];
  
  const article = sourceArticle[0];
  
  // Get articles with same category
  const sameCategory = article.categoryId 
    ? await db
        .select()
        .from(articles)
        .where(and(
          eq(articles.categoryId, article.categoryId),
          eq(articles.status, 'published'),
          not(eq(articles.id, articleId))
        ))
        .limit(50)
    : [];
  
  // Get articles with overlapping tags
  const sourceTags = await db
    .select({ tagId: article_tags.tagId })
    .from(article_tags)
    .where(eq(article_tags.articleId, articleId));
  
  let overlappingTags: typeof articles.$inferSelect[] = [];
  if (sourceTags.length > 0) {
    const tagIds = sourceTags.map(t => t.tagId);
    overlappingTags = await db
      .selectDistinct({ article: articles })
      .from(article_tags)
      .innerJoin(articles, eq(article_tags.articleId, articles.id))
      .where(and(
        inArray(article_tags.tagId, tagIds),
        eq(articles.status, 'published'),
        not(eq(articles.id, articleId))
      ))
      .limit(50)
      .then(rows => rows.map(r => r.article));
  }
  
  // Combine and deduplicate
  const candidateMap = new Map<number, typeof articles.$inferSelect>();
  for (const a of [...sameCategory, ...overlappingTags]) {
    candidateMap.set(a.id, a);
  }
  
  // Score candidates
  const results: RecommendationResult[] = [];
  
  for (const candidate of candidateMap.values()) {
    let score = 0;
    const components = {
      collaborative: 0,
      contentBased: 0,
      popularity: 0,
      recency: 0,
    };
    
    // Category match
    if (candidate.categoryId === article.categoryId) {
      score += 30;
      components.contentBased += 30;
    }
    
    // Calculate tag overlap
    const candidateTags = await db
      .select({ tagId: article_tags.tagId })
      .from(article_tags)
      .where(eq(article_tags.articleId, candidate.id));
    
    const sourceTagIds = new Set(sourceTags.map(t => t.tagId));
    const candidateTagIds = new Set(candidateTags.map(t => t.tagId));
    
    let tagOverlap = 0;
    for (const tagId of candidateTagIds) {
      if (sourceTagIds.has(tagId)) tagOverlap++;
    }
    
    const totalUniqueTags = new Set([...sourceTagIds, ...candidateTagIds]).size;
    if (totalUniqueTags > 0) {
      const tagScore = 50 * (tagOverlap / totalUniqueTags);
      score += tagScore;
      components.contentBased += tagScore;
    }
    
    // Add popularity component
    const popScore = calculatePopularityScore(candidate) * 0.2;
    score += popScore;
    components.popularity = popScore;
    
    results.push({
      article: candidate,
      score,
      reason: 'Related to this article',
      components,
    });
  }
  
  // Sort and limit
  results.sort((a, b) => b.score - a.score);
  
  return results.slice(0, limit);
}

/**
 * Get cold start recommendations for new users
 */
export async function getColdStartRecommendations(
  limit: number = 20
): Promise<RecommendationResult[]> {
  // For new users, prioritize popular and recent content
  const popularArticles = await db
    .select()
    .from(articles)
    .where(eq(articles.status, 'published'))
    .orderBy(desc(articles.viewCount))
    .limit(50);
  
  const recommendations: RecommendationResult[] = popularArticles.map(article => {
    const popularityScore = calculatePopularityScore(article);
    const recencyScore = calculateRecencyBonus(article);
    const totalScore = popularityScore * 0.8 + recencyScore * 0.2;
    
    return {
      article,
      score: totalScore,
      reason: 'Popular in the community',
      components: {
        collaborative: 0,
        contentBased: 0,
        popularity: popularityScore,
        recency: recencyScore,
      },
    };
  });
  
  recommendations.sort((a, b) => b.score - a.score);
  
  return recommendations.slice(0, limit);
}
