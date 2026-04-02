import { pgTable, serial, varchar, text, integer, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './index';
import { articles } from './index';

// Active collaboration sessions (presence tracking)
export const collaboration_sessions = pgTable('collaboration_sessions', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  cursorPosition: jsonb('cursor_position').$type<{ line: number; column: number }>(),
  currentSection: varchar('current_section', { length: 100 }),
  isActive: boolean('is_active').default(true),
  lastActivity: timestamp('last_activity').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('collab_session_article_idx').on(table.articleId),
  userIdx: index('collab_session_user_idx').on(table.userId),
  sessionIdIdx: index('collab_session_session_idx').on(table.sessionId),
  activeIdx: index('collab_session_active_idx').on(table.isActive),
}));

// Section locks for exclusive editing
export const section_locks = pgTable('section_locks', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  sectionName: varchar('section_name', { length: 100 }).notNull(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).notNull(),
  lockedAt: timestamp('locked_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleSectionIdx: index('section_lock_article_section_idx').on(table.articleId, table.sectionName),
  userIdx: index('section_lock_user_idx').on(table.userId),
  expiresIdx: index('section_lock_expires_idx').on(table.expiresAt),
}));

// Collaboration edit history
export const collaboration_edits = pgTable('collaboration_edits', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }),
  editType: varchar('edit_type', { 
    enum: ['text_insert', 'text_delete', 'text_replace', 'section_lock', 'section_unlock'],
    length: 20 
  }).notNull(),
  sectionName: varchar('section_name', { length: 100 }),
  position: jsonb('position').$type<{ start: number; end: number }>(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('collab_edit_article_idx').on(table.articleId),
  userIdx: index('collab_edit_user_idx').on(table.userId),
  createdIdx: index('collab_edit_created_idx').on(table.createdAt),
}));

// Conflict resolution records
export const edit_conflicts = pgTable('edit_conflicts', {
  id: serial('id').primaryKey(),
  articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  sectionName: varchar('section_name', { length: 100 }),
  conflictingUserId: integer('conflicting_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  conflictingEdit: jsonb('conflicting_edit').notNull(),
  originalUserId: integer('original_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  originalEdit: jsonb('original_edit').notNull(),
  resolution: varchar('resolution', {
    enum: ['auto_merged', 'manual_merge', 'last_write_wins', 'pending'],
    length: 20
  }).default('pending'),
  resolvedValue: text('resolved_value'),
  resolvedBy: integer('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  articleIdx: index('edit_conflict_article_idx').on(table.articleId),
  resolutionIdx: index('edit_conflict_resolution_idx').on(table.resolution),
  createdIdx: index('edit_conflict_created_idx').on(table.createdAt),
}));
