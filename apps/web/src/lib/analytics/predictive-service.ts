/**
 * Predictive Analytics Service
 * Provides ML-based predictions for article growth, trending topics, and resource needs
 */

import { db, articles, page_views, categories, eq, sql, gte, desc, and } from '@aidepedia/db';

export interface ArticleGrowthPrediction {
  articleId: number;
  title: string;
  currentViews: number;
  predictedViewsNext7Days: number;
  predictedViewsNext30Days: number;
  growthRate: number; // percentage
  confidence: number; // 0-1
}

export interface TrendingTopic {
  topic: string;
  category: string;
  momentum: number; // rate of change
  currentViews: number;
  predictedGrowth: number;
}

export interface ResourceNeedsPrediction {
  category: string;
  currentArticles: number;
  predictedDemandNext30Days: number;
  suggestedNewArticles: number;
  priority: 'low' | 'medium' | 'high';
}

/**
 * Simple Linear Regression implementation
 */
class LinearRegression {
  private slope: number = 0;
  private intercept: number = 0;

  fit(x: number[], y: number[]): void {
    const n = x.length;
    if (n === 0) return;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumXX = x.reduce((total, xi) => total + xi * xi, 0);

    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) {
      this.slope = 0;
      this.intercept = sumY / n;
      return;
    }

    this.slope = (n * sumXY - sumX * sumY) / denominator;
    this.intercept = (sumY - this.slope * sumX) / n;
  }

  predict(x: number): number {
    return this.slope * x + this.intercept;
  }

  predictMultiple(x: number[]): number[] {
    return x.map(xi => this.predict(xi));
  }

  getRSquared(x: number[], y: number[]): number {
    if (x.length === 0) return 0;
    
    const yMean = y.reduce((a, b) => a + b, 0) / y.length;
    const predictions = this.predictMultiple(x);
    
    let ssRes = 0;
    let ssTot = 0;
    
    for (let i = 0; i < y.length; i++) {
      ssRes += Math.pow(y[i] - predictions[i], 2);
      ssTot += Math.pow(y[i] - yMean, 2);
    }
    
    return ssTot === 0 ? 0 : 1 - (ssRes / ssTot);
  }
}

/**
 * Forecast article growth using linear regression
 */
export async function forecastArticleGrowth(
  articleId: number,
  daysBack: number = 30
): Promise<ArticleGrowthPrediction | null> {
  try {
    // Get historical daily views for the article
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const dailyViews = await db
      .select({
        date: sql<string>`DATE(${page_views.createdAt})`,
        views: sql<number>`COUNT(*)`,
      })
      .from(page_views)
      .where(
        and(
          eq(page_views.articleId, articleId),
          gte(page_views.createdAt, startDate)
        )
      )
      .groupBy(sql`DATE(${page_views.createdAt})`)
      .orderBy(sql`DATE(${page_views.createdAt})`);

    if (dailyViews.length < 3) {
      return null; // Not enough data
    }

    // Prepare data for regression
    const x: number[] = dailyViews.map((_, i) => i);
    const y: number[] = dailyViews.map(d => Number(d.views));

    // Fit linear regression model
    const model = new LinearRegression();
    model.fit(x, y);

    // Calculate predictions
    const lastDay = x[x.length - 1];
    const predictedNext7 = model.predict(lastDay + 7);
    const predictedNext30 = model.predict(lastDay + 30);

    // Calculate growth rate
    const currentViews = y.reduce((a, b) => a + b, 0);
    const avgDailyViews = currentViews / daysBack;
    const growthRate = ((model.slope / avgDailyViews) * 100);

    // Get article details
    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    return {
      articleId,
      title: article?.title || 'Unknown',
      currentViews,
      predictedViewsNext7Days: Math.max(0, Math.round(predictedNext7 * 7)),
      predictedViewsNext30Days: Math.max(0, Math.round(predictedNext30 * 30)),
      growthRate: Math.round(growthRate * 100) / 100,
      confidence: Math.min(1, Math.max(0, model.getRSquared(x, y))),
    };
  } catch (error) {
    console.error('Error forecasting article growth:', error);
    return null;
  }
}

/**
 * Predict trending topics based on recent momentum
 */
export async function predictTrendingTopics(
  daysBack: number = 7,
  limit: number = 10
): Promise<TrendingTopic[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Get recent views by category and tags
    const recentViews = await db
      .select({
        articleId: page_views.articleId,
        categoryId: articles.categoryId,
        category: categories.name,
        tags: articles.tags,
        views: sql<number>`COUNT(*)`,
      })
      .from(page_views)
      .leftJoin(articles, eq(page_views.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(
        and(
          gte(page_views.createdAt, startDate),
          sql`${page_views.articleId} IS NOT NULL`
        )
      )
      .groupBy(
        page_views.articleId,
        articles.categoryId,
        categories.name,
        articles.tags
      );

    // Aggregate by topic (tag)
    const topicStats = new Map<string, {
      category: string;
      views: number;
      articles: number;
    }>();

    recentViews.forEach(view => {
      const tags = view.tags as string[] || [];
      tags.forEach(tag => {
        const existing = topicStats.get(tag) || {
          category: view.category || 'Uncategorized',
          views: 0,
          articles: 0,
        };
        existing.views += Number(view.views);
        existing.articles += 1;
        topicStats.set(tag, existing);
      });
    });

    // Calculate momentum and sort
    const trendingTopics: TrendingTopic[] = Array.from(topicStats.entries())
      .map(([topic, stats]) => ({
        topic,
        category: stats.category,
        momentum: stats.views / stats.articles, // Average views per article
        currentViews: stats.views,
        predictedGrowth: Math.round((stats.views / daysBack) * 30), // Project monthly
      }))
      .sort((a, b) => b.momentum - a.momentum)
      .slice(0, limit);

    return trendingTopics;
  } catch (error) {
    console.error('Error predicting trending topics:', error);
    return [];
  }
}

/**
 * Estimate resource needs by category
 */
export async function estimateResourceNeeds(
  daysBack: number = 30
): Promise<ResourceNeedsPrediction[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Get views and article count by category
    const categoryStats = await db
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

    // Calculate predictions
    const predictions: ResourceNeedsPrediction[] = categoryStats.map(stat => {
      const avgViewsPerArticle = Number(stat.totalViews) / Math.max(1, Number(stat.articleCount));
      const predictedDemandNext30Days = Number(stat.totalViews) * 2; // Simple projection
      const currentArticles = Number(stat.articleCount);
      
      // Estimate needed articles based on demand
      const targetViewsPerArticle = 500; // Target threshold
      const suggestedNewArticles = Math.max(
        0,
        Math.ceil((predictedDemandNext30Days / targetViewsPerArticle) - currentArticles)
      );

      // Determine priority
      const ratio = predictedDemandNext30Days / Math.max(1, currentArticles);
      const priority: 'low' | 'medium' | 'high' = 
        ratio > 5000 ? 'high' : ratio > 2000 ? 'medium' : 'low';

      return {
        category: stat.categoryName || 'Uncategorized',
        currentArticles,
        predictedDemandNext30Days,
        suggestedNewArticles,
        priority,
      };
    });

    return predictions.sort((a, b) => 
      b.predictedDemandNext30Days - a.predictedDemandNext30Days
    );
  } catch (error) {
    console.error('Error estimating resource needs:', error);
    return [];
  }
}

/**
 * Get all predictions for an article
 */
export async function getArticlePredictions(articleId: number) {
  const [growth] = await Promise.all([
    forecastArticleGrowth(articleId),
  ]);

  return {
    growth,
  };
}
