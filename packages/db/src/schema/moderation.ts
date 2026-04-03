import { pgTable, serial, varchar, text, integer, timestamp, boolean, index, jsonb, decimal } from 'drizzle-orm/pg-core';
import { articles } from './index';

// Duplicate detection records
export const duplicate_detection = pgTable('duplicate_detection', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  duplicateArticleId: integer('duplicate_article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Similarity metrics
  similarityScore: decimal('similarity_score', { precision: 5, scale: 2 }).notNull(), // 0-100
  contentHash: varchar('content_hash', { length: 64 }).notNull(), // SHA-256 fingerprint
  minhashSignature: text('minhash_signature').notNull(), // JSON array of hash values
  
  // Detection details
  matchType: varchar('match_type', {
    enum: ['exact', 'near_duplicate', 'similar'],
    length: 20
  }).notNull(),
  
  // Matching sections (for partial duplicates)
  matchingSections: jsonb('matching_sections').$type<Array<{
    start: number;
    end: number;
    text: string;
  }>>(),
  
  // Status
  status: varchar('status', {
    enum: ['pending', 'reviewed', 'merged', 'dismissed'],
    length: 20
  }).notNull().default('pending'),
  
  reviewedBy: integer('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('dup_article_idx').on(table.articleId),
  duplicateArticleIdx: index('dup_duplicate_article_idx').on(table.duplicateArticleId),
  similarityIdx: index('dup_similarity_idx').on(table.similarityScore),
  contentHashIdx: index('dup_content_hash_idx').on(table.contentHash),
  statusIdx: index('dup_status_idx').on(table.status),
  createdAtIdx: index('dup_created_at_idx').on(table.createdAt),
}));

// Spam detection flags
export const spam_flags = pgTable('spam_flags', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Spam classification
  spamType: varchar('spam_type', {
    enum: ['gibberish', 'promotional', 'duplicate', 'off_topic', 'low_quality', 'malicious'],
    length: 20
  }).notNull(),
  
  // Confidence scores
  spamScore: decimal('spam_score', { precision: 5, scale: 2 }).notNull(), // 0-100
  confidence: decimal('confidence', { precision: 5, scale: 2 }).notNull(), // 0-100
  
  // ML features extracted
  features: jsonb('features').$type<{
    textLength: number;
    wordCount: number;
    avgWordLength: number;
    specialCharRatio: number;
    uppercaseRatio: number;
    linkCount: number;
    repetitionScore: number;
    readabilityScore: number;
    sentimentScore: number;
    languageDetected: string;
    gibberishProbability: number;
  }>().notNull(),
  
  // Detection details
  detectionMethod: varchar('detection_method', {
    enum: ['ml_model', 'rule_based', 'manual', 'hybrid'],
    length: 20
  }).notNull().default('hybrid'),
  
  // Reasoning/explanation
  reasons: text('reasons').array().notNull().default([]),
  
  // Status
  status: varchar('status', {
    enum: ['pending', 'confirmed', 'false_positive', 'appealed'],
    length: 20
  }).notNull().default('pending'),
  
  flaggedBy: integer('flagged_by'),
  reviewedBy: integer('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  articleIdx: index('spam_article_idx').on(table.articleId),
  spamTypeIdx: index('spam_type_idx').on(table.spamType),
  spamScoreIdx: index('spam_score_idx').on(table.spamScore),
  statusIdx: index('spam_status_idx').on(table.status),
  createdAtIdx: index('spam_created_at_idx').on(table.createdAt),
}));

// Moderation queue for human review
export const moderation_queue = pgTable('moderation_queue', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Queue item details
  queueType: varchar('queue_type', {
    enum: ['spam', 'duplicate', 'plagiarism', 'quality', 'manual'],
    length: 20
  }).notNull(),
  
  priority: integer('priority').notNull().default(0), // Higher = more urgent
  
  // Auto-action thresholds
  autoAction: varchar('auto_action', {
    enum: ['none', 'approve', 'reject', 'flag'],
    length: 20
  }).notNull().default('flag'),
  
  // Reason for queueing
  reason: text('reason').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  
  // Assignment
  assignedTo: integer('assigned_to'),
  assignedAt: timestamp('assigned_at'),
  
  // Status
  status: varchar('status', {
    enum: ['pending', 'in_review', 'approved', 'rejected', 'escalated'],
    length: 20
  }).notNull().default('pending'),
  
  // Decision details
  decision: text('decision'),
  decidedBy: integer('decided_by'),
  decidedAt: timestamp('decided_at'),
  
  // Appeal tracking
  appealCount: integer('appeal_count').default(0),
  lastAppealAt: timestamp('last_appeal_at'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  articleIdx: index('mod_queue_article_idx').on(table.articleId),
  queueTypeIdx: index('mod_queue_type_idx').on(table.queueType),
  statusIdx: index('mod_queue_status_idx').on(table.status),
  priorityIdx: index('mod_queue_priority_idx').on(table.priority),
  assignedToIdx: index('mod_queue_assigned_to_idx').on(table.assignedTo),
  createdAtIdx: index('mod_queue_created_at_idx').on(table.createdAt),
}));

// Moderation actions log
export const moderation_actions = pgTable('moderation_actions', {
  id: serial('id').primaryKey(),
  queueItemId: integer('queue_item_id').notNull().references(() => moderation_queue.id, { onDelete: 'cascade' }),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Action details
  action: varchar('action', {
    enum: ['approved', 'rejected', 'escalated', 'appealed', 'dismissed', 'merged'],
    length: 20
  }).notNull(),
  
  performedBy: integer('performed_by').notNull(),
  reason: text('reason'),
  
  // Before/after state
  previousStatus: varchar('previous_status', { length: 20 }),
  newStatus: varchar('new_status', { length: 20 }),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  queueItemIdx: index('mod_action_queue_item_idx').on(table.queueItemId),
  articleIdx: index('mod_action_article_idx').on(table.articleId),
  performedByIdx: index('mod_action_performed_by_idx').on(table.performedBy),
  createdAtIdx: index('mod_action_created_at_idx').on(table.createdAt),
}));

// Plagiarism detection results
export const plagiarism_checks = pgTable('plagiarism_checks', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Originality score (0-100, higher = more original)
  originalityScore: decimal('originality_score', { precision: 5, scale: 2 }).notNull(),
  
  // Internal plagiarism (against other articles in the system)
  internalMatches: jsonb('internal_matches').$type<Array<{
    articleId: number;
    articleTitle: string;
    similarityScore: number;
    matchingSections: Array<{ start: number; end: number; text: string }>;
  }>>().default([]),
  
  // External plagiarism (if API available)
  externalMatches: jsonb('external_matches').$type<Array<{
    source: string;
    url: string;
    similarityScore: number;
    matchingSections: Array<{ start: number; end: number; text: string }>;
  }>>().default([]),
  
  // Citation verification
  citationCheck: jsonb('citation_check').$type<{
    totalCitations: number;
    verifiedCitations: number;
    brokenCitations: number;
    suspiciousCitations: number;
  }>(),
  
  // Status
  status: varchar('status', {
    enum: ['pending', 'completed', 'failed'],
    length: 20
  }).notNull().default('pending'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  articleIdx: index('plagiarism_article_idx').on(table.articleId),
  originalityIdx: index('plagiarism_originality_idx').on(table.originalityScore),
  statusIdx: index('plagiarism_status_idx').on(table.status),
  createdAtIdx: index('plagiarism_created_at_idx').on(table.createdAt),
}));

// Moderation analytics (aggregated stats)
export const moderation_analytics = pgTable('moderation_analytics', {
  id: serial('id').primaryKey(),
  date: timestamp('date').notNull(),
  
  // Spam stats
  totalSpamFlagged: integer('total_spam_flagged').default(0),
  spamConfirmed: integer('spam_confirmed').default(0),
  spamFalsePositives: integer('spam_false_positives').default(0),
  spamPendingReview: integer('spam_pending_review').default(0),
  
  // Duplicate stats
  totalDuplicatesFound: integer('total_duplicates_found').default(0),
  duplicatesMerged: integer('duplicates_merged').default(0),
  duplicatesDismissed: integer('duplicates_dismissed').default(0),
  
  // Plagiarism stats
  plagiarismChecksRun: integer('plagiarism_checks_run').default(0),
  avgOriginalityScore: decimal('avg_originality_score', { precision: 5, scale: 2 }),
  
  // Queue stats
  avgQueueTimeHours: decimal('avg_queue_time_hours', { precision: 6, scale: 2 }),
  totalItemsReviewed: integer('total_items_reviewed').default(0),
  
  // Accuracy metrics
  autoActionAccuracy: decimal('auto_action_accuracy', { precision: 5, scale: 2 }), // % of auto-actions that were correct
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  dateIdx: index('mod_analytics_date_idx').on(table.date),
}));
