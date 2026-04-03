import { pgTable, serial, varchar, text, integer, timestamp, boolean, index, jsonb } from 'drizzle-orm/pg-core';
import { articles } from './index';
import { users } from './index';

// Article branches for parallel editing
export const article_branches = pgTable('article_branches', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  
  // Branch source information
  parentBranchId: integer('parent_branch_id').references((): any => article_branches.id, { onDelete: 'set null' }),
  sourceRevisionId: integer('source_revision_id'), // The revision this branch was created from
  
  // Branch metadata
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', {
    enum: ['active', 'merged', 'abandoned'],
    length: 20
  }).notNull().default('active'),
  
  // Branch head (latest commit on this branch)
  headRevisionId: integer('head_revision_id'),
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  mergedAt: timestamp('merged_at'),
  abandonedAt: timestamp('abandoned_at'),
}, (table) => ({
  articleIdx: index('branch_article_idx').on(table.articleId),
  parentBranchIdx: index('branch_parent_idx').on(table.parentBranchId),
  statusIdx: index('branch_status_idx').on(table.status),
  createdByIdx: index('branch_created_by_idx').on(table.createdBy),
}));

// Link revisions to branches (like git commits to branches)
export const branch_commits = pgTable('branch_commits', {
  id: serial('id').primaryKey(),
  branchId: integer('branch_id').notNull().references(() => article_branches.id, { onDelete: 'cascade' }),
  revisionId: integer('revision_id').notNull(), // References article_revisions.id
  
  // Commit metadata
  commitMessage: text('commit_message'),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  branchIdx: index('commit_branch_idx').on(table.branchId),
  revisionIdx: index('commit_revision_idx').on(table.revisionId),
  createdByIdx: index('commit_created_by_idx').on(table.createdBy),
}));

// Merge history to track all merges
export const merge_history = pgTable('merge_history', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Source and target branches
  sourceBranchId: integer('source_branch_id').notNull().references(() => article_branches.id, { onDelete: 'cascade' }),
  targetBranchId: integer('target_branch_id').notNull().references(() => article_branches.id, { onDelete: 'cascade' }),
  
  // Merge details
  mergedBy: integer('merged_by').references(() => users.id, { onDelete: 'set null' }),
  mergeMessage: text('merge_message'),
  
  // Conflict information
  hasConflicts: boolean('has_conflicts').default(false),
  conflictResolution: jsonb('conflict_resolution').$type<Array<{
    field: string;
    resolution: 'ours' | 'theirs' | 'manual';
    value?: string;
  }>>(),
  
  // Status
  status: varchar('status', {
    enum: ['pending', 'completed', 'failed'],
    length: 20
  }).notNull().default('completed'),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('merge_article_idx').on(table.articleId),
  sourceBranchIdx: index('merge_source_idx').on(table.sourceBranchId),
  targetBranchIdx: index('merge_target_idx').on(table.targetBranchId),
  mergedByIdx: index('merge_merged_by_idx').on(table.mergedBy),
  createdAtIdx: index('merge_created_at_idx').on(table.createdAt),
}));

// Version snapshots for complete article state at a point in time
export const version_snapshots = pgTable('version_snapshots', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  revisionId: integer('revision_id').notNull(),
  
  // Complete article state
  snapshotData: jsonb('snapshot_data').notNull().$type<{
    title: string;
    content: string;
    excerpt?: string;
    categoryId?: number;
    tags: string[];
    metadata?: Record<string, unknown>;
  }>(),
  
  // Snapshot metadata
  snapshotType: varchar('snapshot_type', {
    enum: ['auto', 'manual', 'pre_merge', 'post_merge'],
    length: 20
  }).notNull().default('auto'),
  
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('snapshot_article_idx').on(table.articleId),
  revisionIdx: index('snapshot_revision_idx').on(table.revisionId),
  typeIdx: index('snapshot_type_idx').on(table.snapshotType),
  createdAtIdx: index('snapshot_created_at_idx').on(table.createdAt),
}));

// Audit trail for version control operations
export const version_audit_log = pgTable('version_audit_log', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  
  // Action details
  action: varchar('action', {
    enum: [
      'branch_created',
      'branch_abandoned',
      'commit_created',
      'merge_initiated',
      'merge_completed',
      'merge_conflict_detected',
      'merge_conflict_resolved',
      'rollback_performed',
      'snapshot_created',
      'version_restored'
    ],
    length: 30
  }).notNull(),
  
  // Actor information
  performedBy: integer('performed_by').references(() => users.id, { onDelete: 'set null' }),
  
  // Related entities
  branchId: integer('branch_id').references(() => article_branches.id, { onDelete: 'set null' }),
  revisionId: integer('revision_id'),
  mergeId: integer('merge_id').references(() => merge_history.id, { onDelete: 'set null' }),
  
  // Additional details
  details: jsonb('details').$type<Record<string, unknown>>(),
  
  // Context
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 500 }),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('version_audit_article_idx').on(table.articleId),
  actionIdx: index('version_audit_action_idx').on(table.action),
  performedByIdx: index('version_audit_performed_by_idx').on(table.performedBy),
  branchIdx: index('version_audit_branch_idx').on(table.branchId),
  createdAtIdx: index('version_audit_created_at_idx').on(table.createdAt),
}));
