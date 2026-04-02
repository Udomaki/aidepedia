/**
 * User Behavior Analytics Service
 * Tracks engagement patterns, identifies user segments, and analyzes user journeys
 */

import { db, page_views, articles, users, comments, bookmarks, article_reactions, eq, and, gte, sql, desc } from '@aidepedia/db';

export interface EngagementPattern {
  timeOfDay: string; // 'morning', 'afternoon', 'evening', 'night'
  dayOfWeek: string;
  avgReadTime: number;
  avgScrollDepth: number;
  totalSessions: number;
}

export interface UserSegment {
  segmentId: string;
  segmentName: string;
  description: string;
  userCount: number;
  characteristics: {
    avgReadTime: number;
    avgScrollDepth: number;
    preferredCategories: string[];
    engagementLevel: 'low' | 'medium' | 'high';
  };
}

export interface UserJourneyStep {
  path: string;
  articleTitle?: string;
  timestamp: Date;
  readTime?: number;
  scrollDepth?: number;
}

export interface UserJourney {
  visitorHash: string;
  steps: UserJourneyStep[];
  totalTime: number; // in seconds
  totalArticles: number;
  avgReadTime: number;
  avgScrollDepth: number;
}

/**
 * Analyze engagement patterns by time
 */
export async function analyzeEngagementPatterns(
  daysBack: number = 30
): Promise<EngagementPattern[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const patterns = await db
      .select({
        hour: sql<number>`EXTRACT(HOUR FROM ${page_views.createdAt})`,
        dayOfWeek: sql<number>`EXTRACT(DOW FROM ${page_views.createdAt})`,
        avgReadTime: sql<number>`AVG(${page_views.readTimeSeconds})`,
        avgScrollDepth: sql<number>`AVG(${page_views.scrollDepth})`,
        totalSessions: sql<number>`COUNT(*)`,
      })
      .from(page_views)
      .where(gte(page_views.createdAt, startDate))
      .groupBy(sql`EXTRACT(HOUR FROM ${page_views.createdAt})`, sql`EXTRACT(DOW FROM ${page_views.createdAt})`);

    // Categorize by time of day
    const timeCategories = new Map<string, EngagementPattern>();

    patterns.forEach(pattern => {
      const hour = Number(pattern.hour);
      const dayOfWeek = Number(pattern.dayOfWeek);
      
      let timeOfDay: string;
      if (hour >= 6 && hour < 12) timeOfDay = 'morning';
      else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
      else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
      else timeOfDay = 'night';

      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = days[dayOfWeek];
      const key = `${timeOfDay}-${dayName}`;

      const existing = timeCategories.get(key) || {
        timeOfDay,
        dayOfWeek: dayName,
        avgReadTime: 0,
        avgScrollDepth: 0,
        totalSessions: 0,
      };

      existing.avgReadTime = (existing.avgReadTime * existing.totalSessions + Number(pattern.avgReadTime || 0)) / (existing.totalSessions + Number(pattern.totalSessions));
      existing.avgScrollDepth = (existing.avgScrollDepth * existing.totalSessions + Number(pattern.avgScrollDepth || 0)) / (existing.totalSessions + Number(pattern.totalSessions));
      existing.totalSessions += Number(pattern.totalSessions);

      timeCategories.set(key, existing);
    });

    return Array.from(timeCategories.values()).sort((a, b) => b.totalSessions - a.totalSessions);
  } catch (error) {
    console.error('Error analyzing engagement patterns:', error);
    return [];
  }
}

/**
 * Identify user segments based on behavior
 */
export async function identifyUserSegments(
  daysBack: number = 30
): Promise<UserSegment[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Get user behavior metrics
    const userMetrics = await db
      .select({
        visitorHash: page_views.visitorHash,
        totalSessions: sql<number>`COUNT(*)`,
        avgReadTime: sql<number>`AVG(${page_views.readTimeSeconds})`,
        avgScrollDepth: sql<number>`AVG(${page_views.scrollDepth})`,
        uniqueArticles: sql<number>`COUNT(DISTINCT ${page_views.articleId})`,
      })
      .from(page_views)
      .where(gte(page_views.createdAt, startDate))
      .groupBy(page_views.visitorHash);

    // Segment users based on engagement
    const segments: Map<string, UserSegment> = new Map([
      ['power-users', {
        segmentId: 'power-users',
        segmentName: 'Power Users',
        description: 'Highly engaged users with long read times and deep scroll depth',
        userCount: 0,
        characteristics: {
          avgReadTime: 0,
          avgScrollDepth: 0,
          preferredCategories: [],
          engagementLevel: 'high',
        },
      }],
      ['casual-readers', {
        segmentId: 'casual-readers',
        segmentName: 'Casual Readers',
        description: 'Users who browse quickly and skim content',
        userCount: 0,
        characteristics: {
          avgReadTime: 0,
          avgScrollDepth: 0,
          preferredCategories: [],
          engagementLevel: 'low',
        },
      }],
      ['regular-users', {
        segmentId: 'regular-users',
        segmentName: 'Regular Users',
        description: 'Users with moderate engagement',
        userCount: 0,
        characteristics: {
          avgReadTime: 0,
          avgScrollDepth: 0,
          preferredCategories: [],
          engagementLevel: 'medium',
        },
      }],
    ]);

    // Classify users into segments
    userMetrics.forEach(user => {
      const avgReadTime = Number(user.avgReadTime || 0);
      const avgScrollDepth = Number(user.avgScrollDepth || 0);
      const uniqueArticles = Number(user.uniqueArticles);

      let segmentKey: string;
      
      if (avgReadTime > 180 && avgScrollDepth > 70 && uniqueArticles > 5) {
        segmentKey = 'power-users';
      } else if (avgReadTime < 60 || avgScrollDepth < 30) {
        segmentKey = 'casual-readers';
      } else {
        segmentKey = 'regular-users';
      }

      const segment = segments.get(segmentKey)!;
      segment.userCount += 1;
      segment.characteristics.avgReadTime = 
        (segment.characteristics.avgReadTime * (segment.userCount - 1) + avgReadTime) / segment.userCount;
      segment.characteristics.avgScrollDepth = 
        (segment.characteristics.avgScrollDepth * (segment.userCount - 1) + avgScrollDepth) / segment.userCount;
    });

    return Array.from(segments.values());
  } catch (error) {
    console.error('Error identifying user segments:', error);
    return [];
  }
}

/**
 * Analyze user journey for a visitor
 */
export async function analyzeUserJourney(
  visitorHash: string,
  daysBack: number = 7
): Promise<UserJourney | null> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const pageViewData = await db
      .select({
        path: page_views.path,
        articleId: page_views.articleId,
        timestamp: page_views.createdAt,
        readTime: page_views.readTimeSeconds,
        scrollDepth: page_views.scrollDepth,
      })
      .from(page_views)
      .where(
        and(
          eq(page_views.visitorHash, visitorHash),
          gte(page_views.createdAt, startDate)
        )
      )
      .orderBy(page_views.createdAt);

    if (pageViewData.length === 0) {
      return null;
    }

    // Get article titles
    const articleIds = pageViewData.filter(pv => pv.articleId).map(pv => pv.articleId);
    const articleDetails = articleIds.length > 0 ? await db
      .select({
        id: articles.id,
        title: articles.title,
      })
      .from(articles)
      .where(sql`${articles.id} IN ${articleIds}`) : [];

    const articleMap = new Map(articleDetails.map(a => [a.id, a.title]));

    const steps: UserJourneyStep[] = pageViewData.map(pv => ({
      path: pv.path,
      articleTitle: pv.articleId ? articleMap.get(pv.articleId) : undefined,
      timestamp: pv.timestamp,
      readTime: pv.readTime || undefined,
      scrollDepth: pv.scrollDepth || undefined,
    }));

    const totalReadTime = steps.reduce((sum, step) => sum + (step.readTime || 0), 0);
    const totalScrollDepth = steps.reduce((sum, step) => sum + (step.scrollDepth || 0), 0);
    const articlesCount = steps.filter(s => s.articleTitle).length;

    return {
      visitorHash,
      steps,
      totalTime: (pageViewData[pageViewData.length - 1].timestamp.getTime() - pageViewData[0].timestamp.getTime()) / 1000,
      totalArticles: articlesCount,
      avgReadTime: articlesCount > 0 ? totalReadTime / articlesCount : 0,
      avgScrollDepth: articlesCount > 0 ? totalScrollDepth / articlesCount : 0,
    };
  } catch (error) {
    console.error('Error analyzing user journey:', error);
    return null;
  }
}

/**
 * Get top user journeys (most engaged visitors)
 */
export async function getTopUserJourneys(
  daysBack: number = 7,
  limit: number = 10
): Promise<UserJourney[]> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Find visitors with most page views
    const topVisitors = await db
      .select({
        visitorHash: page_views.visitorHash,
        viewCount: sql<number>`COUNT(*)`,
      })
      .from(page_views)
      .where(gte(page_views.createdAt, startDate))
      .groupBy(page_views.visitorHash)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limit);

    const journeys: UserJourney[] = [];

    for (const visitor of topVisitors) {
      const journey = await analyzeUserJourney(visitor.visitorHash, daysBack);
      if (journey) {
        journeys.push(journey);
      }
    }

    return journeys;
  } catch (error) {
    console.error('Error getting top user journeys:', error);
    return [];
  }
}
