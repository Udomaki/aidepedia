/**
 * Content Gap Analysis Service
 * Finds missing topics, suggests article ideas, and prioritizes by demand
 */

import { db, articles, page_views, categories, tags, article_tags, eq, and, gte, sql, desc, isNull, not } from '@aidepedia/db';

export interface ContentGap {
  gapId: string;
  suggestedTitle: string;
  suggestedCategory: string;
  demandScore: number; // 0-100
  searchVolume: number; // estimated searches/views
  competition: 'low' | 'medium' | 'high';
  priority: 'low' | 'medium' | 'high' | 'critical';
  relatedExistingArticles: string[];
  suggestedTags: string[];
  reason: string;
}

export interface TopicDemand {
  topic: string;
  category: string;
  currentArticles: number;
  estimatedDemand: number;
  gap: number; // demand - current capacity
}

/**
 * Analyze content gaps by comparing search demand with existing content
 */
export async function findContentGaps(
  daysBack: number = 30,
  limit: number = 20
): Promise<ContentGap[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Get search patterns from 404s and failed searches
    const failedSearches = await db
      .select({
        path: page_views.path,
        views: sql<number>`COUNT(*)`,
      })
      .from(page_views)
      .leftJoin(articles, eq(page_views.path, sql`CONCAT('/articles/', ${articles.slug})`))
      .where(
        and(
          gte(page_views.createdAt, startDate),
          isNull(articles.id),
          sql`${page_views.path} LIKE '/articles/%'`
        )
      )
      .groupBy(page_views.path)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limit);

    // Get topics with high traffic but few articles
    const topicDemand = await analyzeTopicDemand(daysBack);

    // Get trending tags that don't have enough articles
    const trendingTagGaps = await findTagGaps(daysBack);

    // Combine all gaps
    const gaps: ContentGap[] = [];

    // Add gaps from failed searches (404s)
    failedSearches.forEach((search, index) => {
      const searchTerm = search.path.replace('/articles/', '').replace(/-/g, ' ');
      gaps.push({
        gapId: `gap-404-${index}`,
        suggestedTitle: toTitleCase(searchTerm),
        suggestedCategory: 'Uncategorized',
        demandScore: Math.min(100, Number(search.views) * 2),
        searchVolume: Number(search.views),
        competition: 'low',
        priority: Number(search.views) > 50 ? 'critical' : Number(search.views) > 20 ? 'high' : 'medium',
        relatedExistingArticles: [],
        suggestedTags: extractKeywords(searchTerm),
        reason: 'Users are searching for this topic but no article exists (404)',
      });
    });

    // Add gaps from topic demand
    topicDemand.forEach((topic, index) => {
      if (topic.gap > 0) {
        gaps.push({
          gapId: `gap-demand-${index}`,
          suggestedTitle: `More articles needed: ${topic.topic}`,
          suggestedCategory: topic.category,
          demandScore: Math.min(100, topic.gap / 10),
          searchVolume: topic.estimatedDemand,
          competition: topic.currentArticles < 3 ? 'low' : 'medium',
          priority: topic.gap > 500 ? 'critical' : topic.gap > 200 ? 'high' : 'medium',
          relatedExistingArticles: [],
          suggestedTags: [topic.topic],
          reason: `High demand (${topic.estimatedDemand} views) but only ${topic.currentArticles} article(s) exist`,
        });
      }
    });

    // Add gaps from trending tags
    trendingTagGaps.forEach((tag, index) => {
      gaps.push({
        gapId: `gap-tag-${index}`,
        suggestedTitle: `Article about ${tag.tag}`,
        suggestedCategory: 'Trending',
        demandScore: Math.min(100, tag.views / 5),
        searchVolume: tag.views,
        competition: 'low',
        priority: tag.views > 100 ? 'high' : 'medium',
        relatedExistingArticles: [],
        suggestedTags: [tag.tag],
        reason: `Trending tag with ${tag.views} views but only ${tag.articleCount} article(s)`,
      });
    });

    // Sort by demand score
    gaps.sort((a, b) => b.demandScore - a.demandScore);

    return gaps.slice(0, limit);
  } catch (error) {
    console.error('Error finding content gaps:', error);
    return [];
  }
}

/**
 * Analyze topic demand vs existing content
 */
async function analyzeTopicDemand(daysBack: number = 30): Promise<TopicDemand[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Get views by category
    const categoryViews = await db
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        articleCount: sql<number>`COUNT(DISTINCT ${articles.id})`,
        totalViews: sql<number>`COUNT(${page_views.id})`,
      })
      .from(categories)
      .leftJoin(articles, eq(articles.categoryId, categories.id))
      .leftJoin(
        page_views,
        and(
          eq(page_views.articleId, articles.id),
          gte(page_views.createdAt, startDate)
        )
      )
      .groupBy(categories.id, categories.name);

    const topicDemand: TopicDemand[] = categoryViews.map(cat => {
      const currentArticles = Number(cat.articleCount);
      const estimatedDemand = Number(cat.totalViews);
      const targetViewsPerArticle = 500; // Target threshold
      const capacity = currentArticles * targetViewsPerArticle;
      const gap = estimatedDemand - capacity;

      return {
        topic: cat.categoryName || 'Unknown',
        category: cat.categoryName || 'Unknown',
        currentArticles,
        estimatedDemand,
        gap: Math.max(0, gap),
      };
    });

    return topicDemand.sort((a, b) => b.gap - a.gap);
  } catch (error) {
    console.error('Error analyzing topic demand:', error);
    return [];
  }
}

/**
 * Find tags with high traffic but few articles
 */
async function findTagGaps(
  daysBack: number = 30
): Promise<Array<{ tag: string; views: number; articleCount: number }>> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Get tags with their view counts and article counts
    const tagStats = await db
      .select({
        tagName: tags.name,
        articleCount: sql<number>`COUNT(DISTINCT ${article_tags.articleId})`,
        totalViews: sql<number>`COUNT(${page_views.id})`,
      })
      .from(tags)
      .leftJoin(article_tags, eq(article_tags.tagId, tags.id))
      .leftJoin(
        page_views,
        and(
          eq(page_views.articleId, article_tags.articleId),
          gte(page_views.createdAt, startDate)
        )
      )
      .groupBy(tags.id, tags.name)
      .having(sql`COUNT(DISTINCT ${article_tags.articleId}) < 5`) // Tags with < 5 articles
      .orderBy(desc(sql`COUNT(${page_views.id})`))
      .limit(10);

    return tagStats.map(stat => ({
      tag: stat.tagName,
      views: Number(stat.totalViews),
      articleCount: Number(stat.articleCount),
    }));
  } catch (error) {
    console.error('Error finding tag gaps:', error);
    return [];
  }
}

/**
 * Suggest article ideas based on content gaps
 */
export async function suggestArticleIdeas(
  daysBack: number = 30,
  limit: number = 10
): Promise<ContentGap[]> {
  const gaps = await findContentGaps(daysBack, limit * 2);
  
  // Filter to only high priority gaps and format as article suggestions
  return gaps
    .filter(gap => gap.priority === 'high' || gap.priority === 'critical')
    .slice(0, limit)
    .map(gap => ({
      ...gap,
      suggestedTitle: generateArticleTitle(gap),
    }));
}

/**
 * Get content gap summary
 */
export async function getContentGapSummary(daysBack: number = 30) {
  const gaps = await findContentGaps(daysBack, 100);

  return {
    totalGaps: gaps.length,
    criticalGaps: gaps.filter(g => g.priority === 'critical').length,
    highPriorityGaps: gaps.filter(g => g.priority === 'high').length,
    mediumPriorityGaps: gaps.filter(g => g.priority === 'medium').length,
    lowPriorityGaps: gaps.filter(g => g.priority === 'low').length,
    topCategories: getTopCategories(gaps),
    averageDemandScore: gaps.reduce((sum, gap) => sum + gap.demandScore, 0) / Math.max(1, gaps.length),
  };
}

/**
 * Helper functions
 */
function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, txt => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}

function extractKeywords(searchTerm: string): string[] {
  // Simple keyword extraction
  const words = searchTerm.toLowerCase().split(/\s+/);
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
  return words.filter(word => word.length > 3 && !stopWords.has(word));
}

function generateArticleTitle(gap: ContentGap): string {
  const templates = [
    `Complete Guide to ${gap.suggestedTitle}`,
    `${gap.suggestedTitle}: Everything You Need to Know`,
    `Understanding ${gap.suggestedTitle}`,
    `${gap.suggestedTitle} Explained`,
    `Introduction to ${gap.suggestedTitle}`,
  ];
  
  return templates[Math.floor(Math.random() * templates.length)];
}

function getTopCategories(gaps: ContentGap[]): Array<{ category: string; count: number }> {
  const categoryCounts = new Map<string, number>();
  
  gaps.forEach(gap => {
    const count = categoryCounts.get(gap.suggestedCategory) || 0;
    categoryCounts.set(gap.suggestedCategory, count + 1);
  });

  return Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}
