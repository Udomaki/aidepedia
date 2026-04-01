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
} from '@aidepedia/db';

export type { Article, ArticleQueryParams, PaginatedResult, ArticleRevision } from '@aidepedia/db';
