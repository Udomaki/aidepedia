import type {
  articles,
  editors,
  articleVotes,
  reputationEvents,
  articleRevisions,
  categories,
  articleUserVotes,
  revisionUserVotes,
  comments,
  article_reactions,
  feature_flags,
} from './schema/index';

// Category types
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

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

// User vote types
export type ArticleUserVote = typeof articleUserVotes.$inferSelect;
export type NewArticleUserVote = typeof articleUserVotes.$inferInsert;
export type UserVoteType = 'upvote' | 'downvote';

export type RevisionUserVote = typeof revisionUserVotes.$inferSelect;
export type NewRevisionUserVote = typeof revisionUserVotes.$inferInsert;

// Article reaction types
export type ArticleReaction = typeof article_reactions.$inferSelect;
export type NewArticleReaction = typeof article_reactions.$inferInsert;

// Feature flag types
export type FeatureFlag = typeof feature_flags.$inferSelect;
export type NewFeatureFlag = typeof feature_flags.$inferInsert;

// Comment types
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

// Threaded comment with replies
export interface ThreadedComment extends Comment {
  author?: {
    id: number;
    name: string | null;
    image: string | null;
  };
  replies?: ThreadedComment[];
}

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
  categoryId?: number;
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
  excludeAuthorIds?: number[]; // For filtering blocked users
}

// Notification types
export interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  content: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: Date;
}

export interface NewNotification {
  userId: number;
  type: string;
  title: string;
  content?: string;
  data?: Record<string, unknown>;
}

// Bookmark types
export interface Bookmark {
  id: number;
  userId: number;
  articleId: number;
  createdAt: Date;
}

export interface NewBookmark {
  userId: number;
  articleId: number;
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

// Tag types
export interface Tag {
  id: number;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface NewTag {
  name: string;
  slug: string;
}

export interface ArticleTag {
  articleId: number;
  tagId: number;
}

// Edit suggestion types
export type EditSuggestionStatus = 'pending' | 'approved' | 'rejected';

export interface EditSuggestion {
  id: number;
  articleId: number;
  userId: number;
  fieldName: string;
  oldValue: string | null;
  newValue: string;
  reason: string | null;
  status: EditSuggestionStatus;
  createdAt: Date;
}

export interface NewEditSuggestion {
  articleId: number;
  userId: number;
  fieldName: string;
  oldValue?: string | null;
  newValue: string;
  reason?: string | null;
}

export interface EditSuggestionWithUser extends EditSuggestion {
  user: {
    id: number;
    name: string | null;
    image: string | null;
  };
}

// Email digest types
export type EmailDigestType = 'daily' | 'weekly';

export interface EmailDigest {
  id: number;
  userId: number;
  type: EmailDigestType;
  enabled: boolean;
  lastSent: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewEmailDigest {
  userId: number;
  type?: EmailDigestType;
  enabled?: boolean;
  lastSent?: Date | null;
}

export interface EmailDigestSettings {
  dailyEnabled: boolean;
  weeklyEnabled: boolean;
}

// Email queue types
export type EmailQueueStatus = 'pending' | 'sent' | 'failed';

export interface EmailQueue {
  id: number;
  to: string;
  subject: string;
  body: string;
  status: EmailQueueStatus;
  createdAt: Date;
  sentAt: Date | null;
}

export interface NewEmailQueue {
  to: string;
  subject: string;
  body: string;
  status?: EmailQueueStatus;
}

// Audit log types
export type AuditAction = 
  | 'user.role_changed'
  | 'user.banned'
  | 'user.unbanned'
  | 'article.approved'
  | 'article.rejected'
  | 'article.deleted'
  | 'settings.changed'
  | 'webhook.created'
  | 'webhook.updated'
  | 'webhook.deleted'
  | 'rate_limit.changed';

export interface AuditLog {
  id: number;
  userId: number | null;
  action: AuditAction | string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface NewAuditLog {
  userId?: number | null;
  action: AuditAction | string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogWithUser extends AuditLog {
  user: {
    id: number;
    name: string | null;
    email: string | null;
  } | null;
}

export interface AuditLogQueryParams extends PaginationParams {
  userId?: number;
  action?: string;
  resourceType?: string;
  dateFrom?: string;
  dateTo?: string;
}

// System settings types
export type SystemSetting = {
  key: string;
  value: Record<string, unknown>;
  updatedAt: Date;
  updatedBy: number | null;
};

export interface MaintenanceModeSettings {
  enabled: boolean;
  message: string;
  estimatedTime: string;
  contactEmail: string;
}

export interface NewSystemSetting {
  key: string;
  value: Record<string, unknown>;
  updatedBy?: number | null;
}

// Content report types
export type ContentType = 'article' | 'comment';
export type ReportReason = 'spam' | 'harassment' | 'misinformation' | 'inappropriate' | 'copyright' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

export interface ContentReport {
  id: number;
  reporterId: number;
  contentType: ContentType;
  contentId: number;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export interface NewContentReport {
  reporterId: number;
  contentType: ContentType;
  contentId: number;
  reason: ReportReason;
  description?: string | null;
}

export interface ContentReportWithDetails extends ContentReport {
  reporter: {
    id: number;
    name: string | null;
    email: string;
  };
  reviewer?: {
    id: number;
    name: string | null;
  } | null;
  content?: {
    type: ContentType;
    id: number;
    title?: string;
    excerpt?: string;
  };
}

export interface ContentReportQueryParams extends PaginationParams {
  status?: ReportStatus;
  reason?: ReportReason;
  contentType?: ContentType;
  reporterId?: number;
}

// Article draft types
export interface ArticleDraft {
  id: number;
  articleId: number | null;
  userId: number;
  title: string | null;
  content: string | null;
  excerpt: string | null;
  tags: string[] | null;
  lastSaved: Date;
  createdAt: Date;
}

export interface NewArticleDraft {
  articleId?: number | null;
  userId: number;
  title?: string | null;
  content?: string | null;
  excerpt?: string | null;
  tags?: string[];
}

export interface ArticleDraftWithArticle extends ArticleDraft {
  article?: {
    id: number;
    slug: string;
    title: string;
    content: string;
    excerpt: string | null;
  } | null;
}

// Moderation types
export type ModeratorRole = 'junior' | 'senior' | 'admin';
export type ModerationFlagReason = 'inappropriate' | 'inaccurate' | 'spam' | 'harassment' | 'misinformation' | 'copyright' | 'other';
export type ModerationFlagSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ModerationFlagStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'escalated';
export type ModerationActionType = 'warn' | 'restrict_editing' | 'temp_ban' | 'perm_ban';
export type AppealStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

export interface ModeratorRoleRecord {
  id: number;
  userId: number;
  role: ModeratorRole;
  permissions: string[];
  assignedBy: number | null;
  assignedAt: Date | null;
  isActive: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface NewModeratorRole {
  userId: number;
  role: ModeratorRole;
  permissions?: string[];
  assignedBy?: number | null;
}

export interface ModerationFlag {
  id: number;
  contentType: 'article' | 'comment' | 'user_profile';
  contentId: number;
  flaggedBy: number;
  reason: ModerationFlagReason;
  description: string | null;
  severity: ModerationFlagSeverity;
  status: ModerationFlagStatus;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  resolution: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface NewModerationFlag {
  contentType: 'article' | 'comment' | 'user_profile';
  contentId: number;
  flaggedBy: number;
  reason: ModerationFlagReason;
  description?: string | null;
  severity?: ModerationFlagSeverity;
}

export interface ModerationFlagWithDetails extends ModerationFlag {
  flagger: {
    id: number;
    name: string | null;
    email: string;
  };
  reviewer?: {
    id: number;
    name: string | null;
  } | null;
  content?: {
    type: 'article' | 'comment' | 'user_profile';
    id: number;
    title?: string | null;
    excerpt?: string | null;
  };
}

export interface ModerationFlagQueryParams extends PaginationParams {
  status?: ModerationFlagStatus;
  severity?: ModerationFlagSeverity;
  reason?: ModerationFlagReason;
  contentType?: 'article' | 'comment' | 'user_profile';
  flaggedBy?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface ModerationAction {
  id: number;
  userId: number;
  actionType: ModerationActionType;
  reason: string;
  relatedFlagId: number | null;
  moderatorId: number;
  duration: number | null;
  expiresAt: Date | null;
  isActive: boolean | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface NewModerationAction {
  userId: number;
  actionType: ModerationActionType;
  reason: string;
  relatedFlagId?: number | null;
  moderatorId: number;
  duration?: number | null;
  expiresAt?: Date | null;
}

export interface ModerationActionWithDetails extends ModerationAction {
  user: {
    id: number;
    name: string | null;
    email: string;
  };
  moderator: {
    id: number;
    name: string | null;
  };
  relatedFlag?: ModerationFlag | null;
}

export interface ModerationAppeal {
  id: number;
  actionId: number;
  appellantId: number;
  reason: string;
  evidence: string | null;
  status: AppealStatus;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  resolution: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface NewModerationAppeal {
  actionId: number;
  appellantId: number;
  reason: string;
  evidence?: string | null;
}

export interface ModerationAppealWithDetails extends ModerationAppeal {
  appellant: {
    id: number;
    name: string | null;
    email: string;
  };
  reviewer?: {
    id: number;
    name: string | null;
  } | null;
  action: ModerationActionWithDetails;
}

export interface ModerationAuditLog {
  id: number;
  moderatorId: number;
  action: string;
  resourceType: 'flag' | 'user' | 'appeal' | 'article' | 'comment';
  resourceId: number | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date | null;
}

export interface ModerationAuditLogWithModerator extends ModerationAuditLog {
  moderator: {
    id: number;
    name: string | null;
    email: string;
  };
}

export interface ModerationAuditLogQueryParams extends PaginationParams {
  moderatorId?: number;
  action?: string;
  resourceType?: 'flag' | 'user' | 'appeal' | 'article' | 'comment';
  dateFrom?: string;
  dateTo?: string;
}
