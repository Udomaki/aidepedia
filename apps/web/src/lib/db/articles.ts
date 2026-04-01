// Re-export database functions from @aidepedia/db
export {
  getArticleBySlug,
  getArticleById,
  listArticles,
  createArticle,
  updateArticle,
  deleteArticle,
} from '@aidepedia/db';

export type { Article, ArticleQueryParams, PaginatedResult } from '@aidepedia/db';
