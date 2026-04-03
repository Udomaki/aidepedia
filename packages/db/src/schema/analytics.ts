import { pgTable, serial, varchar, text, integer, timestamp, boolean, index, jsonb } from 'drizzle-orm/pg-core';

// Custom Dashboards
export const dashboards = pgTable('dashboards', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  userId: integer('user_id').notNull(),
  isPublic: boolean('is_public').default(false),
  widgets: jsonb('widgets').notNull().$type<Array<{
    id: string;
    type: 'chart' | 'metric' | 'table';
    title: string;
    config: Record<string, any>;
    position: { x: number; y: number; w: number; h: number };
  }>>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdx: index('dashboard_user_idx').on(table.userId),
  publicIdx: index('dashboard_public_idx').on(table.isPublic),
  createdAtIdx: index('dashboard_created_at_idx').on(table.createdAt),
}));

// Report definitions
export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  type: varchar('type', {
    enum: ['usage', 'content', 'user', 'revenue', 'retention'],
    length: 20
  }).notNull(),
  userId: integer('user_id').notNull(),
  config: jsonb('config').notNull().$type<{
    dateRange: { start: string; end: string };
    filters: Record<string, any>;
    metrics: string[];
    groupBy?: string[];
  }>(),
  lastGenerated: timestamp('last_generated'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  typeIdx: index('report_type_idx').on(table.type),
  userIdx: index('report_user_idx').on(table.userId),
  createdAtIdx: index('report_created_at_idx').on(table.createdAt),
}));

// Scheduled reports
export const scheduled_reports = pgTable('scheduled_reports', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id').notNull(),
  userId: integer('user_id').notNull(),
  schedule: varchar('schedule', {
    enum: ['daily', 'weekly', 'monthly'],
    length: 10
  }).notNull(),
  nextRun: timestamp('next_run').notNull(),
  lastRun: timestamp('last_run'),
  deliveryMethod: varchar('delivery_method', {
    enum: ['email', 'slack', 'webhook'],
    length: 10
  }).notNull(),
  deliveryConfig: jsonb('delivery_config').$type<{
    emails?: string[];
    slackWebhook?: string;
    webhookUrl?: string;
  }>(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  reportIdx: index('scheduled_report_report_idx').on(table.reportId),
  userIdx: index('scheduled_report_user_idx').on(table.userId),
  nextRunIdx: index('scheduled_report_next_run_idx').on(table.nextRun),
  activeIdx: index('scheduled_report_active_idx').on(table.active),
}));

// Cohort analysis data
export const cohort_analyses = pgTable('cohort_analyses', {
  id: serial('id').primaryKey(),
  cohortMonth: timestamp('cohort_month').notNull(),
  totalUsers: integer('total_users').notNull().default(0),
  retentionData: jsonb('retention_data').notNull().$type<{
    month0: number;
    month1?: number;
    month2?: number;
    month3?: number;
    month4?: number;
    month5?: number;
    month6?: number;
    month7?: number;
    month8?: number;
    month9?: number;
    month10?: number;
    month11?: number;
    month12?: number;
  }>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  cohortMonthIdx: index('cohort_month_idx').on(table.cohortMonth),
}));

// Funnel tracking
export const funnels = pgTable('funnels', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  steps: jsonb('steps').notNull().$type<Array<{
    name: string;
    event: string;
    order: number;
  }>>(),
  userId: integer('user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdx: index('funnel_user_idx').on(table.userId),
  createdAtIdx: index('funnel_created_at_idx').on(table.createdAt),
}));

// Funnel events tracking
export const funnel_events = pgTable('funnel_events', {
  id: serial('id').primaryKey(),
  funnelId: integer('funnel_id').notNull(),
  stepOrder: integer('step_order').notNull(),
  userId: integer('user_id'),
  sessionId: varchar('session_id', { length: 255 }),
  completed: boolean('completed').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  funnelIdx: index('funnel_event_funnel_idx').on(table.funnelId),
  userIdx: index('funnel_event_user_idx').on(table.userId),
  createdAtIdx: index('funnel_event_created_at_idx').on(table.createdAt),
}));

// Engagement scores
export const engagement_scores = pgTable('engagement_scores', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  score: integer('score').notNull().default(0),
  factors: jsonb('factors').notNull().$type<{
    logins: number;
    articlesRead: number;
    articlesCreated: number;
    commentsPosted: number;
    votesCast: number;
  }>(),
  calculatedAt: timestamp('calculated_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('engagement_score_user_idx').on(table.userId),
  scoreIdx: index('engagement_score_score_idx').on(table.score),
  calculatedAtIdx: index('engagement_score_calculated_at_idx').on(table.calculatedAt),
}));

// Churn predictions
export const churn_predictions = pgTable('churn_predictions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  churnProbability: integer('churn_probability').notNull(), // 0-100
  riskLevel: varchar('risk_level', {
    enum: ['low', 'medium', 'high'],
    length: 10
  }).notNull(),
  factors: jsonb('factors').$type<Array<{
    factor: string;
    impact: number;
  }>>(),
  predictedAt: timestamp('predicted_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('churn_prediction_user_idx').on(table.userId),
  riskLevelIdx: index('churn_prediction_risk_level_idx').on(table.riskLevel),
  predictedAtIdx: index('churn_prediction_predicted_at_idx').on(table.predictedAt),
}));

// Revenue analytics (if monetization active)
export const revenue_analytics = pgTable('revenue_analytics', {
  id: serial('id').primaryKey(),
  date: timestamp('date').notNull(),
  mrr: integer('mrr').notNull().default(0), // Monthly Recurring Revenue in cents
  arr: integer('arr').notNull().default(0), // Annual Recurring Revenue in cents
  newMrr: integer('new_mrr').notNull().default(0),
  churnedMrr: integer('churned_mrr').notNull().default(0),
  netMrr: integer('net_mrr').notNull().default(0),
  activeSubscriptions: integer('active_subscriptions').notNull().default(0),
  newSubscriptions: integer('new_subscriptions').notNull().default(0),
  churnedSubscriptions: integer('churned_subscriptions').notNull().default(0),
  ltv: integer('ltv').notNull().default(0), // Lifetime Value in cents
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  dateIdx: index('revenue_analytics_date_idx').on(table.date),
}));

// Export history
export const export_history = pgTable('export_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  reportType: varchar('report_type', { length: 50 }).notNull(),
  format: varchar('format', {
    enum: ['csv', 'pdf', 'json'],
    length: 10
  }).notNull(),
  dateRange: jsonb('date_range').$type<{
    start: string;
    end: string;
  }>(),
  recordCount: integer('record_count'),
  fileSize: integer('file_size'), // in bytes
  downloadUrl: varchar('download_url', { length: 1000 }),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('export_history_user_idx').on(table.userId),
  createdAtIdx: index('export_history_created_at_idx').on(table.createdAt),
}));
