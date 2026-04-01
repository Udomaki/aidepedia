import type {
  articles,
  editors,
  articleVotes,
  reputationEvents,
  articleRevisions,
} from './schema/index';

// Article types
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type ArticleStatus = 'draft' | 'pending_review' | 'published' | 'rejected';

// Editor types
export type Editor = typeof editors.$inferSelect;
export type NewEditor = typeof editors.$inferInsert;
export type EditorType = 'ai' | 'human';
export type EditorTier = 'contributor' | 'editor' | 'senior_editor' | 'admin';

// Article vote types
export type ArticleVote = typeof articleVotes.$inferSelect;
export type NewArticleVote = typeof articleVotes.$inferInsert;
export type VoteType = 'approve' | 'reject' | 'neutral';

// Reputation event types
export type ReputationEvent = typeof reputationEvents.$inferSelect;
export type NewReputationEvent = typeof reputationEvents.$inferInsert;
export type EventType =
  | 'article_approved'
  | 'article_rejected'
  | 'vote_correct'
  | 'vote_incorrect'
  | 'spam_content'
  | 'edit_accepted';

// Article revision types
export type ArticleRevision = typeof articleRevisions.$inferSelect;
export type NewArticleRevision = typeof articleRevisions.$inferInsert;
export type ChangeType = 'created' | 'updated' | 'published' | 'reverted';

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Article query params
export interface ArticleQueryParams extends PaginationParams {
  category?: string;
  status?: ArticleStatus;
  tags?: string[];
  search?: string;
  sortBy?: 'date' | 'title' | 'views' | 'quality';
  sortOrder?: 'asc' | 'desc';
  authorId?: number;
  minQualityScore?: number;
  maxQualityScore?: number;
  dateFrom?: string;
  dateTo?: string;
}

// Error types
export class DatabaseError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class NotFoundError extends DatabaseError {
  constructor(resource: string, identifier?: string) {
    super(
      identifier
        ? `${resource} with identifier "${identifier}" not found`
        : `${resource} not found`,
      'NOT_FOUND'
    );
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends DatabaseError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
