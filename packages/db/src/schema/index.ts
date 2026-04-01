import { pgTable, serial, varchar, text, integer, timestamp, boolean, index } from 'drizzle-orm/pg-core';

// Auth tables for @auth/core
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: timestamp('email_verified'),
  image: varchar('image', { length: 500 }),
  bio: text('bio'),
  showActivity: boolean('show_activity').default(true),
  showBadges: boolean('show_badges').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  emailIdx: index('user_email_idx').on(table.email),
}));

export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 255 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: varchar('token_type', { length: 255 }),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: varchar('session_state', { length: 255 }),
}, (table) => ({
  providerIdx: index('account_provider_idx').on(table.provider, table.providerAccountId),
  userIdx: index('account_user_idx').on(table.userId),
}));

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  sessionToken: varchar('session_token', { length: 255 }).notNull().unique(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires').notNull(),
}, (table) => ({
  sessionTokenIdx: index('session_token_idx').on(table.sessionToken),
  userIdx: index('session_user_idx').on(table.userId),
}));

export const verificationTokens = pgTable('verification_tokens', {
  identifier: varchar('identifier', { length: 255 }).notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expires: timestamp('expires').notNull(),
}, (table) => ({
  identifierTokenIdx: index('verification_token_idx').on(table.identifier, table.token),
}));

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

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id').references((): any => comments.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  articleIdx: index('comment_article_idx').on(table.articleId),
  userIdx: index('comment_user_idx').on(table.userId),
  parentIdx: index('comment_parent_idx').on(table.parentId),
}));
