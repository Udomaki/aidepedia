import { eq, desc, and, or, like, inArray, sql, count } from 'drizzle-orm';
import { db } from './index';
import { articles, articleRevisions } from './schema/index';
import type {
  Article,
  NewArticle,
  ArticleRevision,
  NewArticleRevision,
  ArticleQueryParams,
  PaginatedResult,
} from './types';
import {
  NotFoundError,
  ValidationError,
  DatabaseError,
} from './types';

/**
 * Fetch an article by its slug
 * @throws {NotFoundError} If article is not found
 */
export async function getArticleBySlug(slug: string): Promise<Article> {
  try {
    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);

    if (!article) {
      throw new NotFoundError('Article', slug);
    }

    return article;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch article by slug: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch an article by its ID
 * @throws {NotFoundError} If article is not found
 */
export async function getArticleById(id: number): Promise<Article> {
  try {
    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, id))
      .limit(1);

    if (!article) {
      throw new NotFoundError('Article', `id:${id}`);
    }

    return article;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch article by id: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List articles with filtering and pagination
 */
export async function listArticles(
  params: ArticleQueryParams = {}
): Promise<PaginatedResult<Article>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [];

    if (params.status) {
      conditions.push(eq(articles.status, params.status));
    }

    if (params.category) {
      conditions.push(eq(articles.category, params.category));
    }

    if (params.tags && params.tags.length > 0) {
      conditions.push(sql`${articles.tags} && ${params.tags}`);
    }

    if (params.search) {
      conditions.push(
        or(
          like(articles.title, `%${params.search}%`),
          like(articles.content, `%${params.search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch data and total count in parallel
    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(articles)
        .where(whereClause)
        .orderBy(desc(articles.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(articles)
        .where(whereClause),
    ]);

    return {
      data,
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to list articles: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a new article
 * @throws {ValidationError} If validation fails
 */
export async function createArticle(
  data: NewArticle,
  editorId: number,
  changeReason?: string
): Promise<Article> {
  try {
    // Validate slug
    const existing = await db
      .select()
      .from(articles)
      .where(eq(articles.slug, data.slug!))
      .limit(1);

    if (existing.length > 0) {
      throw new ValidationError(`Article with slug "${data.slug}" already exists`);
    }

    // Create article
    const [article] = await db
      .insert(articles)
      .values({
        ...data,
        authorId: editorId,
      })
      .returning();

    // Create initial revision
    await createArticleRevision({
      articleId: article.id,
      editorId,
      title: article.title,
      content: article.content!,
      excerpt: article.excerpt,
      category: article.category,
      tags: article.tags || [],
      changeReason: changeReason || 'Initial version',
      changeType: 'created',
    });

    return article;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to create article: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update an existing article
 * @throws {NotFoundError} If article is not found
 */
export async function updateArticle(
  id: number,
  updates: Partial<NewArticle>,
  editorId: number,
  changeReason?: string
): Promise<Article> {
  try {
    // Check if article exists
    const existing = await getArticleById(id);

    // If changing slug, check it's not taken
    if (updates.slug && updates.slug !== existing.slug) {
      const slugExists = await db
        .select()
        .from(articles)
        .where(eq(articles.slug, updates.slug))
        .limit(1);

      if (slugExists.length > 0) {
        throw new ValidationError(`Article with slug "${updates.slug}" already exists`);
      }
    }

    // Update article
    const [article] = await db
      .update(articles)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, id))
      .returning();

    // Create revision
    await createArticleRevision({
      articleId: article.id,
      editorId,
      title: article.title,
      content: article.content!,
      excerpt: article.excerpt,
      category: article.category,
      tags: article.tags || [],
      changeReason: changeReason || 'Article updated',
      changeType: 'updated',
    });

    return article;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to update article: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get article revision history
 * @throws {NotFoundError} If article is not found
 */
export async function getArticleRevisions(
  articleId: number,
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<ArticleRevision>> {
  try {
    // Verify article exists
    await getArticleById(articleId);

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(articleRevisions)
        .where(eq(articleRevisions.articleId, articleId))
        .orderBy(desc(articleRevisions.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(articleRevisions)
        .where(eq(articleRevisions.articleId, articleId)),
    ]);

    return {
      data,
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch article revisions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get a specific revision
 * @throws {NotFoundError} If revision is not found
 */
export async function getRevisionById(revisionId: number): Promise<ArticleRevision> {
  try {
    const [revision] = await db
      .select()
      .from(articleRevisions)
      .where(eq(articleRevisions.id, revisionId))
      .limit(1);

    if (!revision) {
      throw new NotFoundError('Article revision', `id:${revisionId}`);
    }

    return revision;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch revision: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create an article revision (internal helper)
 */
async function createArticleRevision(
  data: NewArticleRevision
): Promise<ArticleRevision> {
  try {
    const [revision] = await db
      .insert(articleRevisions)
      .values(data)
      .returning();

    return revision;
  } catch (error) {
    throw new DatabaseError(`Failed to create revision: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Revert an article to a specific revision
 * @throws {NotFoundError} If article or revision is not found
 */
export async function revertToRevision(
  articleId: number,
  revisionId: number,
  editorId: number
): Promise<Article> {
  try {
    // Get revision
    const revision = await getRevisionById(revisionId);

    if (revision.articleId !== articleId) {
      throw new ValidationError('Revision does not belong to this article');
    }

    // Update article with revision data
    const [article] = await db
      .update(articles)
      .set({
        title: revision.title,
        content: revision.content,
        excerpt: revision.excerpt,
        category: revision.category,
        tags: revision.tags,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleId))
      .returning();

    // Create revision for this revert action
    await createArticleRevision({
      articleId: article.id,
      editorId,
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      category: article.category,
      tags: article.tags || [],
      changeReason: `Reverted to revision ${revisionId}`,
      changeType: 'reverted',
    });

    return article;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to revert article: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete an article (soft delete by setting status to rejected)
 * @throws {NotFoundError} If article is not found
 */
export async function deleteArticle(articleId: number): Promise<Article> {
  try {
    const [article] = await db
      .update(articles)
      .set({
        status: 'rejected',
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleId))
      .returning();

    if (!article) {
      throw new NotFoundError('Article', `id:${articleId}`);
    }

    return article;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to delete article: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
