import { eq, desc, and, or, like, inArray, sql, count, gte, lte, between, avg, sum } from 'drizzle-orm';
import { db } from './index';
import {
  dashboards,
  reports,
  scheduled_reports,
  cohort_analyses,
  funnels,
  funnel_events,
  engagement_scores,
  churn_predictions,
  revenue_analytics,
  export_history,
  users,
  articles,
  page_views,
  api_performance,
} from './schema/index';
import {
  NotFoundError,
  ValidationError,
  DatabaseError,
} from './types';

// Dashboard functions
export async function createDashboard(data: {
  name: string;
  description?: string;
  userId: number;
  isPublic?: boolean;
  widgets: Array<{
    id: string;
    type: 'chart' | 'metric' | 'table';
    title: string;
    config: Record<string, any>;
    position: { x: number; y: number; w: number; h: number };
  }>;
}) {
  try {
    const [dashboard] = await db.insert(dashboards).values(data).returning();
    return dashboard;
  } catch (error) {
    throw new DatabaseError(`Failed to create dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getDashboard(id: number) {
  try {
    const [dashboard] = await db
      .select()
      .from(dashboards)
      .where(eq(dashboards.id, id))
      .limit(1);

    if (!dashboard) {
      throw new NotFoundError('Dashboard', `id:${id}`);
    }

    return dashboard;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function listUserDashboards(userId: number) {
  try {
    return await db
      .select()
      .from(dashboards)
      .where(eq(dashboards.userId, userId))
      .orderBy(desc(dashboards.updatedAt));
  } catch (error) {
    throw new DatabaseError(`Failed to list dashboards: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function updateDashboard(id: number, data: Partial<{
  name: string;
  description: string;
  isPublic: boolean;
  widgets: any;
}>) {
  try {
    const [dashboard] = await db
      .update(dashboards)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(dashboards.id, id))
      .returning();

    if (!dashboard) {
      throw new NotFoundError('Dashboard', `id:${id}`);
    }

    return dashboard;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to update dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function deleteDashboard(id: number) {
  try {
    const [deleted] = await db
      .delete(dashboards)
      .where(eq(dashboards.id, id))
      .returning();

    if (!deleted) {
      throw new NotFoundError('Dashboard', `id:${id}`);
    }

    return deleted;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to delete dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Report functions
export async function createReport(data: {
  name: string;
  description?: string;
  type: 'usage' | 'content' | 'user' | 'revenue' | 'retention';
  userId: number;
  config: {
    dateRange: { start: string; end: string };
    filters: Record<string, any>;
    metrics: string[];
    groupBy?: string[];
  };
}) {
  try {
    const [report] = await db.insert(reports).values(data).returning();
    return report;
  } catch (error) {
    throw new DatabaseError(`Failed to create report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getReport(id: number) {
  try {
    const [report] = await db
      .select()
      .from(reports)
      .where(eq(reports.id, id))
      .limit(1);

    if (!report) {
      throw new NotFoundError('Report', `id:${id}`);
    }

    return report;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function listUserReports(userId: number) {
  try {
    return await db
      .select()
      .from(reports)
      .where(eq(reports.userId, userId))
      .orderBy(desc(reports.updatedAt));
  } catch (error) {
    throw new DatabaseError(`Failed to list reports: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function deleteReport(id: number) {
  try {
    const [deleted] = await db
      .delete(reports)
      .where(eq(reports.id, id))
      .returning();

    if (!deleted) {
      throw new NotFoundError('Report', `id:${id}`);
    }

    return deleted;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to delete report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Scheduled report functions
export async function createScheduledReport(data: {
  reportId: number;
  userId: number;
  schedule: 'daily' | 'weekly' | 'monthly';
  nextRun: Date;
  deliveryMethod: 'email' | 'slack' | 'webhook';
  deliveryConfig: {
    emails?: string[];
    slackWebhook?: string;
    webhookUrl?: string;
  };
}) {
  try {
    const [scheduled] = await db.insert(scheduled_reports).values(data).returning();
    return scheduled;
  } catch (error) {
    throw new DatabaseError(`Failed to create scheduled report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function listScheduledReports(userId: number) {
  try {
    return await db
      .select()
      .from(scheduled_reports)
      .where(eq(scheduled_reports.userId, userId))
      .orderBy(scheduled_reports.nextRun);
  } catch (error) {
    throw new DatabaseError(`Failed to list scheduled reports: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getPendingScheduledReports() {
  try {
    const now = new Date();
    return await db
      .select()
      .from(scheduled_reports)
      .where(
        and(
          eq(scheduled_reports.active, true),
          lte(scheduled_reports.nextRun, now)
        )
      );
  } catch (error) {
    throw new DatabaseError(`Failed to get pending scheduled reports: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function updateScheduledReportNextRun(id: number, nextRun: Date) {
  try {
    const [updated] = await db
      .update(scheduled_reports)
      .set({ nextRun, lastRun: new Date(), updatedAt: new Date() })
      .where(eq(scheduled_reports.id, id))
      .returning();

    return updated;
  } catch (error) {
    throw new DatabaseError(`Failed to update scheduled report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Analytics query functions
export async function getUsageAnalytics(startDate: Date, endDate: Date) {
  try {
    const apiStats = await db
      .select({
        endpoint: api_performance.endpoint,
        totalCalls: count(),
        avgResponseTime: avg(api_performance.responseTime),
        errorCount: sum(sql`CASE WHEN ${api_performance.statusCode} >= 400 THEN 1 ELSE 0 END`),
      })
      .from(api_performance)
      .where(
        and(
          gte(api_performance.createdAt, startDate),
          lte(api_performance.createdAt, endDate)
        )
      )
      .groupBy(api_performance.endpoint);

    return apiStats;
  } catch (error) {
    throw new DatabaseError(`Failed to get usage analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getContentAnalytics(startDate: Date, endDate: Date) {
  try {
    const articleStats = await db
      .select({
        totalViews: sum(page_views),
        totalArticles: count(articles.id),
      })
      .from(articles)
      .leftJoin(page_views, eq(articles.id, page_views.articleId))
      .where(
        and(
          gte(articles.createdAt, startDate),
          lte(articles.createdAt, endDate)
        )
      );

    const topArticles = await db
      .select({
        articleId: page_views.articleId,
        title: articles.title,
        viewCount: count(),
      })
      .from(page_views)
      .leftJoin(articles, eq(page_views.articleId, articles.id))
      .where(
        and(
          gte(page_views.createdAt, startDate),
          lte(page_views.createdAt, endDate)
        )
      )
      .groupBy(page_views.articleId, articles.title)
      .orderBy(desc(count()))
      .limit(10);

    return {
      stats: articleStats[0],
      topArticles,
    };
  } catch (error) {
    throw new DatabaseError(`Failed to get content analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getUserAnalytics(startDate: Date, endDate: Date) {
  try {
    const userStats = await db
      .select({
        totalUsers: count(),
        newUsers: sum(sql`CASE WHEN ${users.createdAt} >= ${startDate} THEN 1 ELSE 0 END`),
      })
      .from(users)
      .where(lte(users.createdAt, endDate));

    return userStats[0];
  } catch (error) {
    throw new DatabaseError(`Failed to get user analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getRetentionAnalytics() {
  try {
    const cohorts = await db
      .select()
      .from(cohort_analyses)
      .orderBy(desc(cohort_analyses.cohortMonth))
      .limit(12);

    return cohorts;
  } catch (error) {
    throw new DatabaseError(`Failed to get retention analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getRevenueAnalytics(startDate: Date, endDate: Date) {
  try {
    const revenue = await db
      .select()
      .from(revenue_analytics)
      .where(
        and(
          gte(revenue_analytics.date, startDate),
          lte(revenue_analytics.date, endDate)
        )
      )
      .orderBy(revenue_analytics.date);

    return revenue;
  } catch (error) {
    throw new DatabaseError(`Failed to get revenue analytics: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Export functions
export async function createExportRecord(data: {
  userId: number;
  reportType: string;
  format: 'csv' | 'pdf' | 'json';
  dateRange?: { start: string; end: string };
  recordCount?: number;
  fileSize?: number;
  downloadUrl?: string;
  expiresAt?: Date;
}) {
  try {
    const [record] = await db.insert(export_history).values(data).returning();
    return record;
  } catch (error) {
    throw new DatabaseError(`Failed to create export record: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getExportHistory(userId: number) {
  try {
    return await db
      .select()
      .from(export_history)
      .where(eq(export_history.userId, userId))
      .orderBy(desc(export_history.createdAt))
      .limit(50);
  } catch (error) {
    throw new DatabaseError(`Failed to get export history: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Engagement scoring
export async function calculateEngagementScore(userId: number) {
  try {
    // Get user activity metrics
    const [userStats] = await db
      .select({
        logins: count(sql`1`), // Simplified - would track login events
        articlesCreated: count(sql`CASE WHEN ${articles.authorId} = ${userId} THEN 1 END`),
      })
      .from(users)
      .leftJoin(articles, eq(users.id, articles.authorId))
      .where(eq(users.id, userId));

    // Calculate score (simplified algorithm)
    const score = Math.min(100, 
      (userStats.logins * 5) +
      (userStats.articlesCreated * 20)
    );

    const factors = {
      logins: userStats.logins,
      articlesRead: 0, // Would need to track this
      articlesCreated: userStats.articlesCreated,
      commentsPosted: 0, // Would need to query comments
      votesCast: 0, // Would need to query votes
    };

    const [engagement] = await db
      .insert(engagement_scores)
      .values({
        userId,
        score,
        factors,
        calculatedAt: new Date(),
      })
      .returning();

    return engagement;
  } catch (error) {
    throw new DatabaseError(`Failed to calculate engagement score: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Churn prediction (simplified)
export async function predictChurn(userId: number) {
  try {
    const engagement = await db
      .select()
      .from(engagement_scores)
      .where(eq(engagement_scores.userId, userId))
      .orderBy(desc(engagement_scores.calculatedAt))
      .limit(1);

    if (!engagement[0]) {
      await calculateEngagementScore(userId);
      return predictChurn(userId);
    }

    const score = engagement[0].score;
    let churnProbability = 0;
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    if (score < 20) {
      churnProbability = 80;
      riskLevel = 'high';
    } else if (score < 50) {
      churnProbability = 50;
      riskLevel = 'medium';
    } else {
      churnProbability = 20;
      riskLevel = 'low';
    }

    const factors = [
      { factor: 'engagement_score', impact: score < 20 ? 40 : score < 50 ? 20 : 10 },
    ];

    const [prediction] = await db
      .insert(churn_predictions)
      .values({
        userId,
        churnProbability,
        riskLevel,
        factors,
        predictedAt: new Date(),
      })
      .returning();

    return prediction;
  } catch (error) {
    throw new DatabaseError(`Failed to predict churn: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
