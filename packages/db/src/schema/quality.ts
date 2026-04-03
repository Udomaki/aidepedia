import { pgTable, serial, integer, timestamp, text, varchar, boolean, index, jsonb } from 'drizzle-orm/pg-core';

/**
 * Quality scores for articles
 * Tracks individual dimension scores and overall quality score
 */
export const quality_scores = pgTable('quality_scores', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().unique(),
  
  // Overall score (0-100)
  overallScore: integer('overall_score').notNull().default(0),
  
  // Dimension scores
  completenessScore: integer('completeness_score').notNull().default(0), // 0-25
  readabilityScore: integer('readability_score').notNull().default(0), // 0-20
  engagementScore: integer('engagement_score').notNull().default(0), // 0-20
  freshnessScore: integer('freshness_score').notNull().default(0), // 0-15
  accuracyScore: integer('accuracy_score').notNull().default(0), // 0-20
  
  // Detailed breakdown
  breakdown: jsonb('breakpoints').notNull().$type<{
    completeness: {
      hasTitle: boolean;
      hasSummary: boolean;
      hasContent: boolean;
      hasTags: boolean;
      hasCategory: boolean;
      tagCount: number;
      wordCount: number;
    };
    readability: {
      fleschKincaid: number;
      avgSentenceLength: number;
      avgParagraphLength: number;
      sentenceCount: number;
      paragraphCount: number;
    };
    engagement: {
      viewCount: number;
      upvoteCount: number;
      commentCount: number;
      bookmarkCount: number;
      viewsPerDay: number;
      upvoteRate: number;
    };
    freshness: {
      daysSinceUpdate: number;
      isRecentlyUpdated: boolean;
      updateFrequency: number;
    };
    accuracy: {
      hasReferences: boolean;
      referenceCount: number;
      isVerified: boolean;
      citationScore: number;
    };
  }>(),
  
  // Metadata
  calculatedAt: timestamp('calculated_at').defaultNow(),
  version: integer('version').notNull().default(1),
}, (table) => ({
  articleIdx: index('quality_score_article_idx').on(table.articleId),
  overallIdx: index('quality_score_overall_idx').on(table.overallScore),
  calculatedIdx: index('quality_score_calculated_idx').on(table.calculatedAt),
}));

/**
 * Quality badges for articles
 * Articles can have multiple badges based on quality metrics
 */
export const quality_badges = pgTable('quality_badges', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull(),
  
  // Badge type
  badgeType: varchar('badge_type', {
    enum: ['featured', 'verified', 'comprehensive', 'trending', 'needs_improvement'],
    length: 30
  }).notNull(),
  
  // Badge metadata
  badgeData: jsonb('badge_data').$type<{
    score?: number;
    awardedAt: string;
    reason?: string;
    metrics?: Record<string, number>;
  }>(),
  
  // Badge status
  isActive: boolean('is_active').notNull().default(true),
  
  // Timestamps
  awardedAt: timestamp('awarded_at').defaultNow(),
  removedAt: timestamp('removed_at'),
}, (table) => ({
  articleIdx: index('quality_badge_article_idx').on(table.articleId),
  badgeTypeIdx: index('quality_badge_type_idx').on(table.badgeType),
  activeIdx: index('quality_badge_active_idx').on(table.isActive),
  articleBadgeIdx: index('quality_badge_article_type_idx').on(table.articleId, table.badgeType),
}));

/**
 * Quality score history
 * Tracks changes in quality scores over time for analytics
 */
export const quality_score_history = pgTable('quality_score_history', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull(),
  
  // Score at this point in time
  overallScore: integer('overall_score').notNull(),
  completenessScore: integer('completeness_score').notNull(),
  readabilityScore: integer('readability_score').notNull(),
  engagementScore: integer('engagement_score').notNull(),
  freshnessScore: integer('freshness_score').notNull(),
  accuracyScore: integer('accuracy_score').notNull(),
  
  // Change reason
  changeReason: varchar('change_reason', {
    enum: ['initial', 'content_update', 'engagement_update', 'manual_review', 'system_recalc'],
    length: 30
  }).notNull(),
  
  recordedAt: timestamp('recorded_at').defaultNow(),
}, (table) => ({
  articleIdx: index('quality_history_article_idx').on(table.articleId),
  recordedIdx: index('quality_history_recorded_idx').on(table.recordedAt),
}));

/**
 * Article references for accuracy scoring
 * Tracks external references and citations
 */
export const article_references = pgTable('article_references', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull(),
  
  // Reference details
  url: varchar('url', { length: 1000 }).notNull(),
  title: varchar('title', { length: 500 }),
  source: varchar('source', { length: 255 }),
  
  // Verification status
  isVerified: boolean('is_verified').default(false),
  verifiedAt: timestamp('verified_at'),
  verifiedBy: integer('verified_by'),
  
  // Metadata
  referenceType: varchar('reference_type', {
    enum: ['citation', 'source', 'further_reading', 'official'],
    length: 20
  }).default('citation'),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('article_reference_article_idx').on(table.articleId),
  urlIdx: index('article_reference_url_idx').on(table.url),
  verifiedIdx: index('article_reference_verified_idx').on(table.isVerified),
}));

/**
 * Quality analytics aggregation
 * Pre-calculated analytics for the quality dashboard
 */
export const quality_analytics = pgTable('quality_analytics', {
  id: serial('id').primaryKey(),
  
  // Time period
  date: timestamp('date').notNull(),
  period: varchar('period', {
    enum: ['daily', 'weekly', 'monthly'],
    length: 10
  }).notNull(),
  
  // Score distribution
  scoreDistribution: jsonb('score_distribution').notNull().$type<{
    '0-19': number;
    '20-39': number;
    '40-59': number;
    '60-79': number;
    '80-89': number;
    '90-100': number;
  }>(),
  
  // Tier counts
  tierCounts: jsonb('tier_counts').notNull().$type<{
    featured: number; // 90+
    verified: number; // 80-89
    good: number; // 60-79
    average: number; // 40-59
    needsImprovement: number; // 0-39
  }>(),
  
  // Badge counts
  badgeCounts: jsonb('badge_counts').notNull().$type<{
    featured: number;
    verified: number;
    comprehensive: number;
    trending: number;
    needsImprovement: number;
  }>(),
  
  // Average scores by dimension
  avgScores: jsonb('avg_scores').notNull().$type<{
    overall: number;
    completeness: number;
    readability: number;
    engagement: number;
    freshness: number;
    accuracy: number;
  }>(),
  
  // Top performing articles
  topArticles: jsonb('top_articles').$type<Array<{
    articleId: number;
    title: string;
    score: number;
  }>>(),
  
  // Lowest scoring articles (for editorial review)
  lowestArticles: jsonb('lowest_articles').$type<Array<{
    articleId: number;
    title: string;
    score: number;
    issues: string[];
  }>>(),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  datePeriodIdx: index('quality_analytics_date_period_idx').on(table.date, table.period),
  periodIdx: index('quality_analytics_period_idx').on(table.period),
}));
