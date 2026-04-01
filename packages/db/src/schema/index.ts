import { pgTable, serial, varchar, text, integer, timestamp, boolean, index } from 'drizzle-orm/pg-core';

export const articles = pgTable('articles', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  categoryId: integer('category_id').references(() => categories.id),
  tags: text('tags').array().default([]),
  
  status: varchar('status', { 
    enum: ['draft', 'pending_review', 'published', 'rejected'],
    length: 20
  }).notNull().default('draft'),
  
  authorId: integer('author_id'),
  qualityScore: integer('quality_score').default(0),
  viewCount: integer('view_count').default(0),
  upvotes: integer('upvotes').default(0),
  downvotes: integer('downvotes').default(0),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  publishedAt: timestamp('published_at'),
}, (table) => ({
  slugIdx: index('slug_idx').on(table.slug),
  categoryIdx: index('category_idx').on(table.categoryId),
  statusIdx: index('status_idx').on(table.status),
}));

export const editors = pgTable('editors', {
  id: serial('id').primaryKey(),
  apiKey: varchar('api_key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { enum: ['ai', 'human'], length: 10 }).notNull(),
  
  reputationScore: integer('reputation_score').default(1200),
  tier: varchar('tier', { 
    enum: ['contributor', 'editor', 'senior_editor', 'admin'],
    length: 20
  }).default('contributor'),
  
  articlesCreated: integer('articles_created').default(0),
  articlesEdited: integer('articles_edited').default(0),
  votesCast: integer('votes_cast').default(0),
  
  isActive: boolean('is_active').default(true),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  apiKeyIdx: index('api_key_idx').on(table.apiKey),
  tierIdx: index('tier_idx').on(table.tier),
}));

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  parentId: integer('parent_id'),
  
  articleCount: integer('article_count').default(0),
  displayOrder: integer('display_order').default(0),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  slugIdx: index('category_slug_idx').on(table.slug),
  parentIdx: index('category_parent_idx').on(table.parentId),
}));

export const articleVotes = pgTable('article_votes', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull(),
  editorId: integer('editor_id').notNull(),
  
  vote: varchar('vote', { 
    enum: ['approve', 'reject', 'neutral'],
    length: 10
  }).notNull(),
  qualityRating: integer('quality_rating'),
  
  comment: text('comment'),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('article_idx').on(table.articleId),
  editorIdx: index('editor_idx').on(table.editorId),
}));

export const reputationEvents = pgTable('reputation_events', {
  id: serial('id').primaryKey(),
  editorId: integer('editor_id').notNull(),
  
  eventType: varchar('event_type', { 
    enum: [
      'article_approved',
      'article_rejected', 
      'vote_correct',
      'vote_incorrect',
      'spam_content',
      'edit_accepted'
    ],
    length: 20
  }).notNull(),
  
  pointsChange: integer('points_change').notNull(),
  relatedArticleId: integer('related_article_id'),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  editorIdx: index('rep_editor_idx').on(table.editorId),
}));

export const articleUserVotes = pgTable('article_user_votes', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull(),
  editorId: integer('editor_id').notNull(),

  voteType: varchar('vote_type', {
    enum: ['upvote', 'downvote'],
    length: 10
  }).notNull(),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  articleEditorIdx: index('article_editor_idx').on(table.articleId, table.editorId),
}));

export const articleRevisions = pgTable('article_revisions', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull(),
  editorId: integer('editor_id').notNull(),
  
  title: varchar('title', { length: 500 }).notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  categoryId: integer('category_id').references(() => categories.id),
  tags: text('tags').array().default([]),
  
  changeReason: text('change_reason'),
  changeType: varchar('change_type', {
    enum: ['created', 'updated', 'published', 'reverted'],
    length: 20
  }).notNull(),

  upvotes: integer('upvotes').default(0),
  downvotes: integer('downvotes').default(0),

  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('revision_article_idx').on(table.articleId),
  editorIdx: index('revision_editor_idx').on(table.editorId),
}));

export const revisionUserVotes = pgTable('revision_user_votes', {
  id: serial('id').primaryKey(),
  revisionId: integer('revision_id').notNull(),
  editorId: integer('editor_id').notNull(),

  voteType: varchar('vote_type', {
    enum: ['upvote', 'downvote'],
    length: 10
  }).notNull(),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  revisionEditorIdx: index('revision_editor_idx').on(table.revisionId, table.editorId),
}));
