import { pgTable, serial, integer, timestamp, real, varchar, boolean, index, text } from 'drizzle-orm/pg-core';
import { users } from './index';
import { articles } from './index';

// User embedding vectors for personalized recommendations
export const user_embeddings = pgTable('user_embeddings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Embedding vector (stored as array of floats)
  // Represents user's reading preferences in latent space
  embedding: real('embedding').array().notNull(),
  
  // Metadata about the embedding
  version: integer('version').notNull().default(1),
  
  // When the embedding was last updated
  lastUpdated: timestamp('last_updated').defaultNow(),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('user_embedding_user_idx').on(table.userId),
  lastUpdatedIdx: index('user_embedding_last_updated_idx').on(table.lastUpdated),
}));

// Article embedding vectors for content-based recommendations
export const article_embeddings = pgTable('article_embeddings', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Embedding vector (stored as array of floats)
  // Represents article's content features in latent space
  embedding: real('embedding').array().notNull(),
  
  // Which embedding model was used
  modelVersion: varchar('model_version', { length: 50 }).notNull().default('v1'),
  
  // When the embedding was last updated
  lastUpdated: timestamp('last_updated').defaultNow(),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('article_embedding_article_idx').on(table.articleId),
  lastUpdatedIdx: index('article_embedding_last_updated_idx').on(table.lastUpdated),
}));

// User interaction tracking for collaborative filtering
export const recommendation_interactions = pgTable('recommendation_interactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Type of interaction
  interactionType: varchar('interaction_type', {
    enum: ['view', 'read', 'bookmark', 'upvote', 'share', 'comment'],
    length: 20
  }).notNull(),
  
  // Interaction strength (weight for algorithm)
  // view=1, read=2, bookmark=3, upvote=4, share=5, comment=6
  strength: integer('strength').notNull().default(1),
  
  // Time spent on article (in seconds)
  timeOnPage: integer('time_on_page'),
  
  // Scroll depth (percentage 0-100)
  scrollDepth: integer('scroll_depth'),
  
  // Context of interaction
  source: varchar('source', { length: 50 }), // 'feed', 'search', 'related', 'direct'
  
  // Timestamp
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('interaction_user_idx').on(table.userId),
  articleIdx: index('interaction_article_idx').on(table.articleId),
  typeIdx: index('interaction_type_idx').on(table.interactionType),
  createdAtIdx: index('interaction_created_at_idx').on(table.createdAt),
  userArticleIdx: index('interaction_user_article_idx').on(table.userId, table.articleId),
}));

// Trending scores for articles
export const article_trending_scores = pgTable('article_trending_scores', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Trending score components
  viewVelocity: real('view_velocity').notNull().default(0), // Views per hour
  upvoteVelocity: real('upvote_velocity').notNull().default(0), // Upvotes per hour
  commentVelocity: real('comment_velocity').notNull().default(0), // Comments per hour
  shareVelocity: real('share_velocity').notNull().default(0), // Shares per hour
  
  // Composite trending score
  trendingScore: real('trending_score').notNull().default(0),
  
  // Time window for calculation
  windowStart: timestamp('window_start').notNull(),
  windowEnd: timestamp('window_end').notNull(),
  
  // Category-specific ranking
  categoryId: integer('category_id'),
  categoryRank: integer('category_rank'),
  
  // Global ranking
  globalRank: integer('global_rank'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  articleIdx: index('trending_article_idx').on(table.articleId),
  scoreIdx: index('trending_score_idx').on(table.trendingScore),
  globalRankIdx: index('trending_global_rank_idx').on(table.globalRank),
  categoryRankIdx: index('trending_category_rank_idx').on(table.categoryId, table.categoryRank),
  windowIdx: index('trending_window_idx').on(table.windowStart, table.windowEnd),
}));

// Related articles cache (pre-computed for performance)
export const related_articles_cache = pgTable('related_articles_cache', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  relatedArticleId: integer('related_article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Similarity score (0-1)
  similarityScore: real('similarity_score').notNull(),
  
  // Components of similarity
  tagOverlap: real('tag_overlap').default(0),
  categoryMatch: real('category_match').default(0),
  contentSimilarity: real('content_similarity').default(0),
  
  // When this was computed
  computedAt: timestamp('computed_at').defaultNow(),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('related_article_idx').on(table.articleId),
  relatedArticleIdx: index('related_related_article_idx').on(table.relatedArticleId),
  similarityIdx: index('related_similarity_idx').on(table.similarityScore),
  uniquePair: index('related_unique_pair_idx').on(table.articleId, table.relatedArticleId),
}));
