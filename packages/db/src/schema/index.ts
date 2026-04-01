import { pgTable, serial, varchar, text, integer, timestamp, boolean, index, jsonb } from 'drizzle-orm/pg-core';

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
  // Two-factor authentication fields
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  twoFactorSecret: varchar('two_factor_secret', { length: 255 }),
  recoveryCodes: text('recovery_codes'),
  twoFactorVerifiedAt: timestamp('two_factor_verified_at'),
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

export const follows = pgTable('follows', {
  id: serial('id').primaryKey(),
  followerId: integer('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: integer('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  followerIdx: index('follow_follower_idx').on(table.followerId),
  followingIdx: index('follow_following_idx').on(table.followingId),
  uniqueFollow: index('follow_unique_idx').on(table.followerId, table.followingId),
}));

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content'),
  data: jsonb('data'),
  read: boolean('read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('notification_user_idx').on(table.userId),
  readIdx: index('notification_read_idx').on(table.read),
  createdAtIdx: index('notification_created_at_idx').on(table.createdAt),
}));

export const bookmarks = pgTable('bookmarks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userArticleIdx: index('bookmark_user_article_idx').on(table.userId, table.articleId),
}));

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  slugIdx: index('tag_slug_idx').on(table.slug),
  nameIdx: index('tag_name_idx').on(table.name),
}));

export const article_tags = pgTable('article_tags', {
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.articleId, table.tagId] }),
  articleIdx: index('article_tag_article_idx').on(table.articleId),
  tagIdx: index('article_tag_tag_idx').on(table.tagId),
}));

export const edit_suggestions = pgTable('edit_suggestions', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fieldName: varchar('field_name', { length: 100 }).notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value').notNull(),
  reason: text('reason'),
  status: varchar('status', {
    enum: ['pending', 'approved', 'rejected'],
    length: 20
  }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('edit_suggestion_article_idx').on(table.articleId),
  userIdx: index('edit_suggestion_user_idx').on(table.userId),
  statusIdx: index('edit_suggestion_status_idx').on(table.status),
}));

export const email_digests = pgTable('email_digests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', {
    enum: ['daily', 'weekly'],
    length: 10
  }).notNull().default('daily'),
  enabled: boolean('enabled').default(true),
  lastSent: timestamp('last_sent'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdx: index('email_digest_user_idx').on(table.userId),
  typeIdx: index('email_digest_type_idx').on(table.type),
}));

export const email_queue = pgTable('email_queue', {
  id: serial('id').primaryKey(),
  to: varchar('to', { length: 255 }).notNull(),
  subject: varchar('subject', { length: 500 }).notNull(),
  body: text('body').notNull(),
  status: varchar('status', {
    enum: ['pending', 'sent', 'failed'],
    length: 20
  }).notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
  sentAt: timestamp('sent_at'),
}, (table) => ({
  statusIdx: index('email_queue_status_idx').on(table.status),
  createdAtIdx: index('email_queue_created_at_idx').on(table.createdAt),
}));

// Analytics tables for privacy-focused page tracking
export const page_views = pgTable('page_views', {
  id: serial('id').primaryKey(),
  // Hashed IP for privacy (SHA-256)
  visitorHash: varchar('visitor_hash', { length: 64 }).notNull(),
  // Page information
  path: varchar('path', { length: 500 }).notNull(),
  articleId: integer('article_id').references(() => articles.id, { onDelete: 'set null' }),
  // Tracking metadata
  referrer: varchar('referrer', { length: 500 }),
  userAgent: varchar('user_agent', { length: 500 }),
  countryCode: varchar('country_code', { length: 2 }),
  // Engagement metrics
  readTimeSeconds: integer('read_time_seconds'),
  scrollDepth: integer('scroll_depth'), // percentage 0-100
  // Timestamp
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  visitorIdx: index('page_view_visitor_idx').on(table.visitorHash),
  pathIdx: index('page_view_path_idx').on(table.path),
  articleIdx: index('page_view_article_idx').on(table.articleId),
  createdAtIdx: index('page_view_created_at_idx').on(table.createdAt),
}));

// Aggregated daily stats for performance
export const daily_page_stats = pgTable('daily_page_stats', {
  id: serial('id').primaryKey(),
  date: timestamp('date').notNull(),
  path: varchar('path', { length: 500 }).notNull(),
  articleId: integer('article_id').references(() => articles.id, { onDelete: 'set null' }),
  // Metrics
  totalViews: integer('total_views').notNull().default(0),
  uniqueVisitors: integer('unique_visitors').notNull().default(0),
  avgReadTimeSeconds: integer('avg_read_time_seconds'),
  avgScrollDepth: integer('avg_scroll_depth'),
  // Traffic sources (aggregated)
  referrerCounts: jsonb('referrer_counts').$type<Record<string, number>>(),
  countryCounts: jsonb('country_counts').$type<Record<string, number>>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  datePathIdx: index('daily_stats_date_path_idx').on(table.date, table.path),
  articleDateIdx: index('daily_stats_article_date_idx').on(table.articleId, table.date),
}));

// Webhook tables for external integrations
export const webhooks = pgTable('webhooks', {
  id: serial('id').primaryKey(),
  url: varchar('url', { length: 500 }).notNull(),
  secret: varchar('secret', { length: 255 }).notNull(),
  events: text('events').array().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  enabledIdx: index('webhook_enabled_idx').on(table.enabled),
}));

export const webhook_deliveries = pgTable('webhook_deliveries', {
  id: serial('id').primaryKey(),
  webhookId: integer('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  event: varchar('event', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', {
    enum: ['pending', 'success', 'failed'],
    length: 20
  }).notNull().default('pending'),
  responseCode: integer('response_code'),
  deliveredAt: timestamp('delivered_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  webhookIdx: index('webhook_delivery_webhook_idx').on(table.webhookId),
  statusIdx: index('webhook_delivery_status_idx').on(table.status),
  createdAtIdx: index('webhook_delivery_created_at_idx').on(table.createdAt),
}));

// System settings for admin configuration
export const system_settings = pgTable('system_settings', {
  key: varchar('key', { length: 100 }).notNull().primaryKey(),
  value: jsonb('value').notNull().$type<Record<string, unknown>>(),
  updatedAt: timestamp('updated_at').defaultNow(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => ({
  keyIdx: index('system_settings_key_idx').on(table.key),
}));

// Audit logs for admin actions
export const audit_logs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 255 }),
  details: jsonb('details').$type<Record<string, unknown>>(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  userIdx: index('audit_log_user_idx').on(table.userId),
  actionIdx: index('audit_log_action_idx').on(table.action),
  resourceTypeIdx: index('audit_log_resource_type_idx').on(table.resourceType),
  createdAtIdx: index('audit_log_created_at_idx').on(table.createdAt),
}));

// Content reports for user-reported inappropriate content
export const content_reports = pgTable('content_reports', {
  id: serial('id').primaryKey(),
  reporterId: integer('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  contentType: varchar('content_type', {
    enum: ['article', 'comment'],
    length: 20
  }).notNull(),
  contentId: integer('content_id').notNull(),
  reason: varchar('reason', {
    enum: ['spam', 'harassment', 'misinformation', 'inappropriate', 'copyright', 'other'],
    length: 20
  }).notNull(),
  description: text('description'),
  status: varchar('status', {
    enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
    length: 20
  }).notNull().default('pending'),
  reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  reporterIdx: index('content_report_reporter_idx').on(table.reporterId),
  contentTypeIdx: index('content_report_content_type_idx').on(table.contentType),
  statusIdx: index('content_report_status_idx').on(table.status),
  createdAtIdx: index('content_report_created_at_idx').on(table.createdAt),
}));

// User blocks for blocking users
export const user_blocks = pgTable('user_blocks', {
  blockerId: integer('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: integer('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.blockerId, table.blockedId] }),
  blockerIdx: index('user_block_blocker_idx').on(table.blockerId),
  blockedIdx: index('user_block_blocked_idx').on(table.blockedId),
}));
