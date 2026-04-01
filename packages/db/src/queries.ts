import { eq, desc, and, or, like, inArray, sql, count, gte, lte, between } from 'drizzle-orm';
import { db } from './index';
import { articles, articleRevisions, categories, editors, reputationEvents, articleUserVotes, revisionUserVotes } from './schema/index';
import type {
  Article,
  NewArticle,
  ArticleRevision,
  NewArticleRevision,
  ArticleQueryParams,
  PaginatedResult,
  Category,
  NewCategory,
  Editor,
  ReputationEvent,
  NewReputationEvent,
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

    if (params.categoryId) {
      conditions.push(eq(articles.categoryId, params.categoryId));
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

    if (params.authorId) {
      conditions.push(eq(articles.authorId, params.authorId));
    }

    if (params.minQualityScore !== undefined) {
      conditions.push(gte(articles.qualityScore, params.minQualityScore));
    }

    if (params.maxQualityScore !== undefined) {
      conditions.push(lte(articles.qualityScore, params.maxQualityScore));
    }

    if (params.dateFrom) {
      conditions.push(gte(articles.createdAt, new Date(params.dateFrom)));
    }

    if (params.dateTo) {
      conditions.push(lte(articles.createdAt, new Date(params.dateTo)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Build order by
    let orderByClause;
    const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';
    
    switch (params.sortBy) {
      case 'title':
        orderByClause = sortOrder === 'asc' ? sql`${articles.title} ASC` : sql`${articles.title} DESC`;
        break;
      case 'views':
        orderByClause = sortOrder === 'asc' ? sql`${articles.viewCount} ASC` : sql`${articles.viewCount} DESC`;
        break;
      case 'quality':
        orderByClause = sortOrder === 'asc' ? sql`${articles.qualityScore} ASC` : sql`${articles.qualityScore} DESC`;
        break;
      case 'date':
      default:
        orderByClause = sortOrder === 'asc' ? sql`${articles.createdAt} ASC` : sql`${articles.createdAt} DESC`;
        break;
    }

    // Fetch data and total count in parallel
    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(articles)
        .where(whereClause)
        .orderBy(orderByClause)
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
      categoryId: article.categoryId,
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
      categoryId: article.categoryId,
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
        categoryId: revision.categoryId,
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
      categoryId: article.categoryId,
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

/**
<<<<<<< HEAD
 * Get all categories
 */
export async function getCategories(): Promise<Category[]> {
  try {
    return await db
      .select()
      .from(categories)
      .orderBy(categories.displayOrder, categories.name);
  } catch (error) {
    throw new DatabaseError(`Failed to fetch categories: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get category by slug
 */
export async function getCategoryBySlug(slug: string): Promise<Category> {
  try {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);

    if (!category) {
      throw new NotFoundError('Category', slug);
    }

    return category;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch category: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a new category
 */
export async function createCategory(data: NewCategory): Promise<Category> {
  try {
    const [category] = await db
      .insert(categories)
      .values(data)
      .returning();

    return category;
  } catch (error) {
    throw new DatabaseError(`Failed to create category: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update a category
 */
export async function updateCategory(
  id: number,
  updates: Partial<NewCategory>
): Promise<Category> {
  try {
    const [category] = await db
      .update(categories)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, id))
      .returning();

    if (!category) {
      throw new NotFoundError('Category', `id:${id}`);
    }

    return category;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to update category: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a category
 */
export async function deleteCategory(id: number): Promise<void> {
  try {
    const [category] = await db
      .delete(categories)
      .where(eq(categories.id, id))
      .returning();

    if (!category) {
      throw new NotFoundError('Category', `id:${id}`);
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to delete category: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get distinct tags from articles
 */
export async function getTags(): Promise<string[]> {
  try {
    const result = await db
      .select({ tags: articles.tags })
      .from(articles)
      .where(eq(articles.status, 'published'));

    // Flatten and deduplicate tags
    const allTags = result.flatMap(r => r.tags || []);
    const uniqueTags = [...new Set(allTags)].sort();
    
    return uniqueTags;
  } catch (error) {
    throw new DatabaseError(`Failed to fetch tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get editor by ID
 */
export async function getEditorById(id: number): Promise<Editor> {
  try {
    const [editor] = await db
      .select()
      .from(editors)
      .where(eq(editors.id, id))
      .limit(1);

    if (!editor) {
      throw new NotFoundError('Editor', `id:${id}`);
    }

    return editor;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch editor: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get reputation events for an editor
 */
export async function getReputationEvents(
  editorId: number,
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<ReputationEvent>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(reputationEvents)
        .where(eq(reputationEvents.editorId, editorId))
        .orderBy(desc(reputationEvents.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(reputationEvents)
        .where(eq(reputationEvents.editorId, editorId)),
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
    throw new DatabaseError(`Failed to fetch reputation events: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Add a reputation event and update editor's reputation score
 */
export async function addReputationEvent(
  data: NewReputationEvent
): Promise<ReputationEvent> {
  try {
    // Create the event
    const [event] = await db
      .insert(reputationEvents)
      .values(data)
      .returning();

    // Update editor's reputation score
    await db
      .update(editors)
      .set({
        reputationScore: sql`${editors.reputationScore} + ${data.pointsChange}`,
      })
      .where(eq(editors.id, data.editorId));

    return event;
  } catch (error) {
    throw new DatabaseError(`Failed to add reputation event: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get editor leaderboard
 */
export async function getEditorLeaderboard(
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<Editor>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(editors)
        .where(eq(editors.isActive, true))
        .orderBy(desc(editors.reputationScore))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(editors)
        .where(eq(editors.isActive, true)),
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
    throw new DatabaseError(`Failed to fetch leaderboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update editor statistics
 */
export async function updateEditorStats(
  editorId: number,
  stats: {
    articlesCreated?: number;
    articlesEdited?: number;
    votesCast?: number;
  }
): Promise<Editor> {
  try {
    const [editor] = await db
      .update(editors)
      .set(stats)
      .where(eq(editors.id, editorId))
      .returning();

    if (!editor) {
      throw new NotFoundError('Editor', `id:${editorId}`);
    }

    return editor;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to update editor stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Vote on an article (upvote or downvote)
 * @throws {NotFoundError} If article is not found
 * @throws {ValidationError} If validation fails
 */
export async function voteOnArticle(
  articleId: number,
  editorId: number,
  voteType: 'upvote' | 'downvote'
): Promise<{ vote: 'upvote' | 'downvote', netScore: number }> {
  try {
    // Check if article exists
    await getArticleById(articleId);

    // Check if user has already voted
    const [existingVote] = await db
      .select()
      .from(articleUserVotes)
      .where(
        and(
          eq(articleUserVotes.articleId, articleId),
          eq(articleUserVotes.editorId, editorId)
        )
      )
      .limit(1);

    let voteDelta = 0;

    if (existingVote) {
      // If same vote, remove it (toggle off)
      if (existingVote.voteType === voteType) {
        await db
          .delete(articleUserVotes)
          .where(
            and(
              eq(articleUserVotes.articleId, articleId),
              eq(articleUserVotes.editorId, editorId)
            )
          );

        // Decrement the appropriate counter
        if (voteType === 'upvote') {
          await db
            .update(articles)
            .set({ upvotes: sql`${articles.upvotes} - 1` })
            .where(eq(articles.id, articleId));
          voteDelta = -1;
        } else {
          await db
            .update(articles)
            .set({ downvotes: sql`${articles.downvotes} - 1` })
            .where(eq(articles.id, articleId));
          voteDelta = 1;
        }
      } else {
        // Change vote (remove old, add new)
        await db
          .update(articleUserVotes)
          .set({ voteType, updatedAt: new Date() })
          .where(
            and(
              eq(articleUserVotes.articleId, articleId),
              eq(articleUserVotes.editorId, editorId)
            )
          );

        // Update counters
        if (voteType === 'upvote') {
          await db
            .update(articles)
            .set({
              upvotes: sql`${articles.upvotes} + 1`,
              downvotes: sql`${articles.downvotes} - 1`,
            })
            .where(eq(articles.id, articleId));
          voteDelta = 2; // -1 to +1 = +2
        } else {
          await db
            .update(articles)
            .set({
              upvotes: sql`${articles.upvotes} - 1`,
              downvotes: sql`${articles.downvotes} + 1`,
            })
            .where(eq(articles.id, articleId));
          voteDelta = -2; // +1 to -1 = -2
        }
      }
    } else {
      // New vote
      await db
        .insert(articleUserVotes)
        .values({
          articleId,
          editorId,
          voteType,
        });

      // Increment the appropriate counter
      if (voteType === 'upvote') {
        await db
          .update(articles)
          .set({ upvotes: sql`${articles.upvotes} + 1` })
          .where(eq(articles.id, articleId));
        voteDelta = 1;
      } else {
        await db
          .update(articles)
          .set({ downvotes: sql`${articles.downvotes} + 1` })
          .where(eq(articles.id, articleId));
        voteDelta = -1;
      }
    }

    // Get updated article
    const article = await getArticleById(articleId);
    const netScore = (article.upvotes || 0) - (article.downvotes || 0);

    // Update editor's vote count
    await db
      .update(require('./schema/index').editors)
      .set({ votesCast: sql`${require('./schema/index').editors.votesCast} + 1` })
      .where(eq(require('./schema/index').editors.id, editorId));

    return { vote: voteType, netScore };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to vote on article: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get a user's vote on an article
 */
export async function getArticleUserVote(
  articleId: number,
  editorId: number
): Promise<'upvote' | 'downvote' | null> {
  try {
    const [vote] = await db
      .select()
      .from(articleUserVotes)
      .where(
        and(
          eq(articleUserVotes.articleId, articleId),
          eq(articleUserVotes.editorId, editorId)
        )
      )
      .limit(1);

    return vote?.voteType || null;
  } catch (error) {
    throw new DatabaseError(`Failed to get article vote: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Vote on a revision (upvote or downvote)
 * @throws {NotFoundError} If revision is not found
 * @throws {ValidationError} If validation fails
 */
export async function voteOnRevision(
  revisionId: number,
  editorId: number,
  voteType: 'upvote' | 'downvote'
): Promise<{ vote: 'upvote' | 'downvote', netScore: number }> {
  try {
    // Check if revision exists
    await getRevisionById(revisionId);

    // Check if user has already voted
    const [existingVote] = await db
      .select()
      .from(revisionUserVotes)
      .where(
        and(
          eq(revisionUserVotes.revisionId, revisionId),
          eq(revisionUserVotes.editorId, editorId)
        )
      )
      .limit(1);

    if (existingVote) {
      // If same vote, remove it (toggle off)
      if (existingVote.voteType === voteType) {
        await db
          .delete(revisionUserVotes)
          .where(
            and(
              eq(revisionUserVotes.revisionId, revisionId),
              eq(revisionUserVotes.editorId, editorId)
            )
          );

        // Decrement the appropriate counter
        if (voteType === 'upvote') {
          await db
            .update(articleRevisions)
            .set({ upvotes: sql`${articleRevisions.upvotes} - 1` })
            .where(eq(articleRevisions.id, revisionId));
        } else {
          await db
            .update(articleRevisions)
            .set({ downvotes: sql`${articleRevisions.downvotes} - 1` })
            .where(eq(articleRevisions.id, revisionId));
        }
      } else {
        // Change vote (remove old, add new)
        await db
          .update(revisionUserVotes)
          .set({ voteType, updatedAt: new Date() })
          .where(
            and(
              eq(revisionUserVotes.revisionId, revisionId),
              eq(revisionUserVotes.editorId, editorId)
            )
          );

        // Update counters
        if (voteType === 'upvote') {
          await db
            .update(articleRevisions)
            .set({
              upvotes: sql`${articleRevisions.upvotes} + 1`,
              downvotes: sql`${articleRevisions.downvotes} - 1`,
            })
            .where(eq(articleRevisions.id, revisionId));
        } else {
          await db
            .update(articleRevisions)
            .set({
              upvotes: sql`${articleRevisions.upvotes} - 1`,
              downvotes: sql`${articleRevisions.downvotes} + 1`,
            })
            .where(eq(articleRevisions.id, revisionId));
        }
      }
    } else {
      // New vote
      await db
        .insert(revisionUserVotes)
        .values({
          revisionId,
          editorId,
          voteType,
        });

      // Increment the appropriate counter
      if (voteType === 'upvote') {
        await db
          .update(articleRevisions)
          .set({ upvotes: sql`${articleRevisions.upvotes} + 1` })
          .where(eq(articleRevisions.id, revisionId));
      } else {
        await db
          .update(articleRevisions)
          .set({ downvotes: sql`${articleRevisions.downvotes} + 1` })
          .where(eq(articleRevisions.id, revisionId));
      }
    }

    // Get updated revision
    const revision = await getRevisionById(revisionId);
    const netScore = (revision.upvotes || 0) - (revision.downvotes || 0);

    return { vote: voteType, netScore };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to vote on revision: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get a user's vote on a revision
 */
export async function getRevisionUserVote(
  revisionId: number,
  editorId: number
): Promise<'upvote' | 'downvote' | null> {
  try {
    const [vote] = await db
      .select()
      .from(revisionUserVotes)
      .where(
        and(
          eq(revisionUserVotes.revisionId, revisionId),
          eq(revisionUserVotes.editorId, editorId)
        )
      )
      .limit(1);

    return vote?.voteType || null;
  } catch (error) {
    throw new DatabaseError(`Failed to get revision vote: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
