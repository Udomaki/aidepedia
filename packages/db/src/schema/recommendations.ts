import { pgTable, serial, varchar, text, integer, timestamp, boolean, index, jsonb } from 'drizzle-orm/pg-core';
import { users } from './index';
import { articles } from './index';

// User recommendation profiles - tracks user preferences and behavior patterns
export const user_recommendation_profiles = pgTable('user_recommendation_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }).unique(),
  
  // Category preferences (category_id -> preference_score)
  categoryPreferences: jsonb('category_preferences').$type<Record<string, number>>().default({}),
  
  // Tag preferences (tag_id -> preference_score)
  tagPreferences: jsonb('tag_preferences').$type<Record<string, number>>().default({}),
  
  // Reading patterns
  avgReadingTime: integer('avg_reading_time').default(0), // Average time spent reading in seconds
  avgScrollDepth: integer('avg_scroll_depth').default(0), // Average scroll depth percentage
  preferredReadingTimes: jsonb('preferred_reading_times').$type<Array<{
    hour: number;
    count: number;
  }>>().default([]),
  
  // Engagement metrics
  totalArticlesRead: integer('total_articles_read').default(0),
  totalBookmarks: integer('total_bookmarks').default(0),
  totalReactions: integer('total_reactions').default(0),
  
  // Recommendation algorithm weights (user-specific customization)
  collaborativeWeight: integer('collaborative_weight').default(50), // 0-100
  contentBasedWeight: integer('content_based_weight').default(50), // 0-100
  
  // Profile freshness
  lastUpdated: timestamp('last_updated').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('user_rec_profile_user_idx').on(table.userId),
  lastUpdatedIdx: index('user_rec_profile_updated_idx').on(table.lastUpdated),
}));

// Reading history - tracks what users have read
export const reading_history = pgTable('reading_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Engagement metrics
  readTimeSeconds: integer('read_time_seconds').default(0),
  scrollDepth: integer('scroll_depth').default(0), // percentage 0-100
  completed: boolean('completed').default(false), // Did they read to the end?
  
  // Timestamp
  readAt: timestamp('read_at').defaultNow(),
}, (table) => ({
  userIdx: index('reading_history_user_idx').on(table.userId),
  articleIdx: index('reading_history_article_idx').on(table.articleId),
  userArticleIdx: index('reading_history_user_article_idx').on(table.userId, table.articleId),
  readAtIdx: index('reading_history_read_at_idx').on(table.readAt),
}));

// Recommendation events - tracks recommendation displays and interactions
export const recommendation_events = pgTable('recommendation_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  visitorHash: varchar('visitor_hash', { length: 64 }), // For anonymous users
  
  // What was recommended
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  sourceArticleId: integer('source_article_id').references(() => articles.id, { onDelete: 'cascade' }), // Article page where recommendation appeared (if applicable)
  
  // Recommendation context
  placement: varchar('placement', {
    enum: ['homepage', 'article_related', 'sidebar', 'continue_reading'],
    length: 20
  }).notNull(),
  
  algorithm: varchar('algorithm', {
    enum: ['collaborative', 'content_based', 'hybrid'],
    length: 20
  }).notNull(),
  
  // Interaction tracking
  displayed: boolean('displayed').default(true),
  clicked: boolean('clicked').default(false),
  clickedAt: timestamp('clicked_at'),
  
  // Feedback
  helpful: boolean('helpful'), // Explicit feedback (null = no feedback)
  
  // A/B testing
  experimentId: integer('experiment_id'),
  variant: varchar('variant', { length: 100 }),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('rec_event_user_idx').on(table.userId),
  visitorIdx: index('rec_event_visitor_idx').on(table.visitorHash),
  articleIdx: index('rec_event_article_idx').on(table.articleId),
  sourceArticleIdx: index('rec_event_source_article_idx').on(table.sourceArticleId),
  placementIdx: index('rec_event_placement_idx').on(table.placement),
  algorithmIdx: index('rec_event_algorithm_idx').on(table.algorithm),
  createdAtIdx: index('rec_event_created_at_idx').on(table.createdAt),
}));

// Article similarity cache - precomputed similarity scores for content-based filtering
export const article_similarity_cache = pgTable('article_similarity_cache', {
  id: serial('id').primaryKey(),
  articleId1: integer('article_id_1').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  articleId2: integer('article_id_2').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Similarity scores (0-100)
  overallSimilarity: integer('overall_similarity').notNull(), // Combined score
  categorySimilarity: integer('category_similarity').default(0),
  tagSimilarity: integer('tag_similarity').default(0),
  contentSimilarity: integer('content_similarity').default(0),
  
  // Metadata
  computedAt: timestamp('computed_at').defaultNow(),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  article1Idx: index('similarity_article1_idx').on(table.articleId1),
  article2Idx: index('similarity_article2_idx').on(table.articleId2),
  articlePairIdx: index('similarity_article_pair_idx').on(table.articleId1, table.articleId2),
  overallSimilarityIdx: index('similarity_overall_idx').on(table.overallSimilarity),
}));

// User similarity cache - precomputed user similarity for collaborative filtering
export const user_similarity_cache = pgTable('user_similarity_cache', {
  id: serial('id').primaryKey(),
  userId1: integer('user_id_1').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userId2: integer('user_id_2').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Similarity score (0-100)
  similarityScore: integer('similarity_score').notNull(),
  
  // Common interests
  commonCategories: jsonb('common_categories').$type<Array<number>>().default([]),
  commonTags: jsonb('common_tags').$type<Array<number>>().default([]),
  
  // Metadata
  computedAt: timestamp('computed_at').defaultNow(),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  user1Idx: index('user_sim_user1_idx').on(table.userId1),
  user2Idx: index('user_sim_user2_idx').on(table.userId2),
  userPairIdx: index('user_sim_pair_idx').on(table.userId1, table.userId2),
  similarityIdx: index('user_sim_score_idx').on(table.similarityScore),
}));

// Recommendation quality metrics - aggregate metrics for monitoring
export const recommendation_metrics = pgTable('recommendation_metrics', {
  id: serial('id').primaryKey(),
  date: timestamp('date').notNull(),
  
  // By algorithm
  collaborativeClickRate: integer('collaborative_click_rate').default(0), // percentage
  contentBasedClickRate: integer('content_based_click_rate').default(0),
  hybridClickRate: integer('hybrid_click_rate').default(0),
  
  // By placement
  homepageClickRate: integer('homepage_click_rate').default(0),
  articleRelatedClickRate: integer('article_related_click_rate').default(0),
  sidebarClickRate: integer('sidebar_click_rate').default(0),
  continueReadingClickRate: integer('continue_reading_click_rate').default(0),
  
  // Overall metrics
  totalRecommendations: integer('total_recommendations').default(0),
  totalClicks: integer('total_clicks').default(0),
  avgHelpfulRating: integer('avg_helpful_rating').default(0), // 0-100
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  dateIdx: index('rec_metrics_date_idx').on(table.date),
}));
