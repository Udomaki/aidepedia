// Re-export database functions from @aidepedia/db
export {
  getArticleBySlug,
  getArticleById,
  listArticles,
  createArticle,
  updateArticle,
  deleteArticle,
  getCategories,
  getTags,
  getArticleRevisions,
  getRevisionById,
  revertToRevision,
  getEditorById,
  getReputationEvents,
  addReputationEvent,
  getEditorLeaderboard,
  updateEditorStats,
} from '@aidepedia/db';

export type { 
  Article, 
  ArticleQueryParams, 
  PaginatedResult, 
  ArticleRevision,
  Editor,
  ReputationEvent,
  NewReputationEvent,
} from '@aidepedia/db';
