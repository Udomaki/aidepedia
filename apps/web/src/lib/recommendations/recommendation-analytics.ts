import {
  trackRecommendationDisplay as trackDisplay,
  trackRecommendationClick,
  trackRecommendationFeedback,
  getRecommendationMetrics,
  upsertRecommendationMetrics,
  getRecommendationEvents,
} from '@aidepedia/db';
import type { RecommendationPlacement, RecommendationAlgorithm } from './types';

export class RecommendationAnalyticsService {
  /**
   * Track when a recommendation is displayed
   */
  async trackDisplay(params: {
    articleId: number;
    placement: RecommendationPlacement;
    algorithm: RecommendationAlgorithm;
    userId?: number;
    visitorHash?: string;
    sourceArticleId?: number;
    experimentId?: number;
    variant?: string;
  }): Promise<number> {
    return trackDisplay(params);
  }

  /**
   * Track when a recommendation is clicked
   */
  async trackClick(eventId: number): Promise<void> {
    return trackRecommendationClick(eventId);
  }

  /**
   * Track explicit user feedback
   */
  async trackFeedback(eventId: number, helpful: boolean): Promise<void> {
    return trackRecommendationFeedback(eventId, helpful);
  }

  /**
   * Aggregate daily metrics
   */
  async aggregateDailyMetrics(date: Date): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await getRecommendationEvents(startOfDay, endOfDay);

    if (events.length === 0) {
      return;
    }

    const algorithmStats = this.calculateStats(
      events,
      e => e.algorithm as RecommendationAlgorithm
    );

    const placementStats = this.calculateStats(
      events,
      e => e.placement as RecommendationPlacement
    );

    const totalRecommendations = events.length;
    const totalClicks = events.filter(e => e.clicked).length;
    const helpfulEvents = events.filter(e => e.helpful !== null);
    const avgHelpfulRating = helpfulEvents.length > 0
      ? Math.round(
          (helpfulEvents.filter(e => e.helpful).length / helpfulEvents.length) * 100
        )
      : 0;

    await upsertRecommendationMetrics(startOfDay, {
      collaborativeClickRate: algorithmStats.collaborative?.clickRate || 0,
      contentBasedClickRate: algorithmStats.content_based?.clickRate || 0,
      hybridClickRate: algorithmStats.hybrid?.clickRate || 0,
      homepageClickRate: placementStats.homepage?.clickRate || 0,
      articleRelatedClickRate: placementStats.article_related?.clickRate || 0,
      sidebarClickRate: placementStats.sidebar?.clickRate || 0,
      continueReadingClickRate: placementStats.continue_reading?.clickRate || 0,
      totalRecommendations,
      totalClicks,
      avgHelpfulRating,
    });
  }

  /**
   * Calculate stats by group
   */
  private calculateStats<K extends string>(
    events: any[],
    groupBy: (e: any) => K
  ): Record<K, { total: number; clicks: number; clickRate: number }> {
    const stats: any = {};

    for (const event of events) {
      const key = groupBy(event);
      
      if (!stats[key]) {
        stats[key] = { total: 0, clicks: 0 };
      }

      stats[key].total++;
      if (event.clicked) {
        stats[key].clicks++;
      }
    }

    for (const key of Object.keys(stats)) {
      stats[key].clickRate = stats[key].total > 0
        ? Math.round((stats[key].clicks / stats[key].total) * 100)
        : 0;
    }

    return stats;
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const metrics = await getRecommendationMetrics(startDate);

    if (metrics.length === 0) {
      return {
        overall: { totalRecommendations: 0, totalClicks: 0, avgClickRate: 0 },
        byAlgorithm: {
          collaborative: { total: 0, clicks: 0, clickRate: 0 },
          content_based: { total: 0, clicks: 0, clickRate: 0 },
          hybrid: { total: 0, clicks: 0, clickRate: 0 },
        },
        byPlacement: {
          homepage: { total: 0, clicks: 0, clickRate: 0 },
          article_related: { total: 0, clicks: 0, clickRate: 0 },
          sidebar: { total: 0, clicks: 0, clickRate: 0 },
          continue_reading: { total: 0, clicks: 0, clickRate: 0 },
        },
      };
    }

    const totalRecommendations = metrics.reduce((sum, m) => sum + (m.totalRecommendations || 0), 0);
    const totalClicks = metrics.reduce((sum, m) => sum + (m.totalClicks || 0), 0);

    const avgCollaborative = this.weightedAverage(
      metrics.map(m => ({ rate: m.collaborativeClickRate || 0, weight: m.totalRecommendations || 0 }))
    );
    const avgContentBased = this.weightedAverage(
      metrics.map(m => ({ rate: m.contentBasedClickRate || 0, weight: m.totalRecommendations || 0 }))
    );
    const avgHybrid = this.weightedAverage(
      metrics.map(m => ({ rate: m.hybridClickRate || 0, weight: m.totalRecommendations || 0 }))
    );
    const avgHomepage = this.weightedAverage(
      metrics.map(m => ({ rate: m.homepageClickRate || 0, weight: m.totalRecommendations || 0 }))
    );
    const avgArticleRelated = this.weightedAverage(
      metrics.map(m => ({ rate: m.articleRelatedClickRate || 0, weight: m.totalRecommendations || 0 }))
    );
    const avgSidebar = this.weightedAverage(
      metrics.map(m => ({ rate: m.sidebarClickRate || 0, weight: m.totalRecommendations || 0 }))
    );
    const avgContinueReading = this.weightedAverage(
      metrics.map(m => ({ rate: m.continueReadingClickRate || 0, weight: m.totalRecommendations || 0 }))
    );

    return {
      overall: {
        totalRecommendations,
        totalClicks,
        avgClickRate: totalRecommendations > 0
          ? Math.round((totalClicks / totalRecommendations) * 100)
          : 0,
      },
      byAlgorithm: {
        collaborative: { total: 0, clicks: 0, clickRate: avgCollaborative },
        content_based: { total: 0, clicks: 0, clickRate: avgContentBased },
        hybrid: { total: 0, clicks: 0, clickRate: avgHybrid },
      },
      byPlacement: {
        homepage: { total: 0, clicks: 0, clickRate: avgHomepage },
        article_related: { total: 0, clicks: 0, clickRate: avgArticleRelated },
        sidebar: { total: 0, clicks: 0, clickRate: avgSidebar },
        continue_reading: { total: 0, clicks: 0, clickRate: avgContinueReading },
      },
    };
  }

  /**
   * Calculate weighted average
   */
  private weightedAverage(values: Array<{ rate: number; weight: number }>): number {
    const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
    
    if (totalWeight === 0) return 0;

    const weightedSum = values.reduce((sum, v) => sum + v.rate * v.weight, 0);
    
    return Math.round(weightedSum / totalWeight);
  }
}
