import { eq, desc, and, or, like, inArray, sql, count, gte, lte, between, not } from 'drizzle-orm';
import { db } from './index';
import { articles, articleRevisions, categories, editors, reputationEvents, articleUserVotes, revisionUserVotes, comments, notifications, tags, article_tags, edit_suggestions, email_digests, email_queue, page_views, system_settings, content_reports, users } from './schema/index';
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
  ThreadedComment,
  Comment,
  Notification,
  Tag,
  NewTag,
  EditSuggestion,
  NewEditSuggestion,
  EditSuggestionWithUser,
  EmailDigest,
  NewEmailDigest,
  EmailDigestSettings,
  EmailQueue,
  NewEmailQueue,
  ContentReport,
  NewContentReport,
  ContentReportWithDetails,
  ContentReportQueryParams,
  ReportStatus,
} from './types';
import {
  NotFoundError,
  ValidationError,
  DatabaseError,
} from './types';
import { triggerWebhookEvent } from './webhooks';

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

    if (params.excludeAuthorIds && params.excludeAuthorIds.length > 0) {
      conditions.push(not(inArray(articles.authorId, params.excludeAuthorIds)));
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

    // Trigger webhook
    await triggerWebhookEvent('article.created', {
      id: article.id,
      slug: article.slug,
      title: article.title,
      authorId: editorId,
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

    // Trigger webhook
    await triggerWebhookEvent('article.updated', {
      id: article.id,
      slug: article.slug,
      title: article.title,
      editorId,
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

    // Trigger webhook
    await triggerWebhookEvent('article.deleted', {
      id: article.id,
      slug: article.slug,
      title: article.title,
    });

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
 * Get distinct tags from articles (legacy - kept for backwards compatibility)
 */
export async function getArticleTagStrings(): Promise<string[]> {
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

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(): Promise<{
  totalArticles: number;
  pendingReviews: number;
  activeEditors: number;
  publishedArticles: number;
}> {
  try {
    const [
      [{ totalArticles }],
      [{ pendingReviews }],
      [{ activeEditors }],
      [{ publishedArticles }],
    ] = await Promise.all([
      db.select({ totalArticles: count() }).from(articles),
      db.select({ pendingReviews: count() }).from(articles).where(eq(articles.status, 'pending_review')),
      db.select({ activeEditors: count() }).from(editors).where(eq(editors.isActive, true)),
      db.select({ publishedArticles: count() }).from(articles).where(eq(articles.status, 'published')),
    ]);

    return {
      totalArticles: Number(totalArticles),
      pendingReviews: Number(pendingReviews),
      activeEditors: Number(activeEditors),
      publishedArticles: Number(publishedArticles),
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch dashboard stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get pending reviews for dashboard
 */
export async function getPendingReviews(
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<Article & { author?: Editor }>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(articles)
        .where(eq(articles.status, 'pending_review'))
        .orderBy(desc(articles.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(articles)
        .where(eq(articles.status, 'pending_review')),
    ]);

    // Fetch author details for each article
    const articlesWithAuthors = await Promise.all(
      data.map(async (article) => {
        let author: Editor | undefined;
        if (article.authorId) {
          try {
            author = await getEditorById(article.authorId);
          } catch (e) {
            // Author not found, continue without author
          }
        }
        return { ...article, author };
      })
    );

    return {
      data: articlesWithAuthors,
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch pending reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get activity feed for dashboard
 */
export async function getActivityFeed(
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<{
  type: 'article_created' | 'article_updated' | 'article_published' | 'revision_created';
  article: Article;
  revision?: ArticleRevision;
  editor?: Editor;
  timestamp: Date;
}>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    // Get recent revisions as activity feed
    const [revisions, [{ total }]] = await Promise.all([
      db
        .select()
        .from(articleRevisions)
        .orderBy(desc(articleRevisions.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(articleRevisions),
    ]);

    // Build activity items
    const activities = await Promise.all(
      revisions.map(async (revision) => {
        const article = await getArticleById(revision.articleId);
        let editor: Editor | undefined;
        try {
          editor = await getEditorById(revision.editorId);
        } catch (e) {
          // Editor not found
        }

        const type = revision.changeType === 'created' 
          ? 'article_created' 
          : revision.changeType === 'published'
          ? 'article_published'
          : revision.changeType === 'reverted'
          ? 'article_updated'
          : 'revision_created';

        return {
          type,
          article,
          revision,
          editor,
          timestamp: revision.createdAt || new Date(),
        };
      })
    );

    return {
      data: activities,
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch activity feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Approve an article (change status to published)
 */
export async function approveArticle(
  articleId: number,
  editorId: number
): Promise<Article> {
  try {
    const [article] = await db
      .update(articles)
      .set({
        status: 'published',
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleId))
      .returning();

    if (!article) {
      throw new NotFoundError('Article', `id:${articleId}`);
    }

    // Create revision for this approval
    await createArticleRevision({
      articleId: article.id,
      editorId,
      title: article.title,
      content: article.content!,
      excerpt: article.excerpt,
      categoryId: article.categoryId,
      tags: article.tags || [],
      changeReason: 'Article approved and published',
      changeType: 'published',
    });

    return article;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to approve article: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Reject an article
 */
export async function rejectArticle(
  articleId: number,
  editorId: number,
  reason?: string
): Promise<Article> {
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

    // Create revision for this rejection
    await createArticleRevision({
      articleId: article.id,
      editorId,
      title: article.title,
      content: article.content!,
      excerpt: article.excerpt,
      categoryId: article.categoryId,
      tags: article.tags || [],
      changeReason: reason || 'Article rejected',
      changeType: 'updated',
    });

    return article;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to reject article: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========== ADMIN QUERIES ==========

/**
 * Get all users with pagination
 */
export async function getAllUsers(
  params: { page?: number; limit?: number; search?: string } = {}
): Promise<PaginatedResult<Editor>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (params.search) {
      conditions.push(like(editors.name, `%${params.search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(editors)
        .where(whereClause)
        .orderBy(desc(editors.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(editors)
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
    throw new DatabaseError(`Failed to fetch users: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update user tier/role
 */
export async function updateUserTier(
  editorId: number,
  tier: 'contributor' | 'editor' | 'senior_editor' | 'admin'
): Promise<Editor> {
  try {
    const [editor] = await db
      .update(editors)
      .set({ tier })
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
    throw new DatabaseError(`Failed to update user tier: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Ban/suspend a user (set isActive to false)
 */
export async function setUserActiveStatus(
  editorId: number,
  isActive: boolean
): Promise<Editor> {
  try {
    const [editor] = await db
      .update(editors)
      .set({ isActive })
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
    throw new DatabaseError(`Failed to update user status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get flagged/reported content (articles with low quality score or high downvotes)
 */
export async function getFlaggedContent(
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<Article & { reportReason?: string }>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    // Get articles with quality score < 50 or downvotes > upvotes
    const [data, [{ total }]] = await Promise.all([
      db
        .select()
        .from(articles)
        .where(
          or(
            sql`${articles.qualityScore} < 50`,
            sql`${articles.downvotes} > ${articles.upvotes}`
          )
        )
        .orderBy(desc(articles.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(articles)
        .where(
          or(
            sql`${articles.qualityScore} < 50`,
            sql`${articles.downvotes} > ${articles.upvotes}`
          )
        ),
    ]);

    // Add report reason
    const flaggedData = data.map(article => ({
      ...article,
      reportReason: article.qualityScore && article.qualityScore < 50
        ? 'Low quality score'
        : 'High downvote ratio',
    }));

    return {
      data: flaggedData,
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch flagged content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get admin dashboard stats
 */
export async function getAdminStats(): Promise<{
  totalUsers: number;
  activeUsers: number;
  totalArticles: number;
  pendingReview: number;
  flagged: number;
  published: number;
}> {
  try {
    const [
      [{ totalUsers }],
      [{ activeUsers }],
      [{ totalArticles }],
      [{ pendingReview }],
      [{ flagged }],
      [{ published }],
    ] = await Promise.all([
      db.select({ totalUsers: count() }).from(editors),
      db.select({ activeUsers: count() }).from(editors).where(eq(editors.isActive, true)),
      db.select({ totalArticles: count() }).from(articles),
      db.select({ pendingReview: count() }).from(articles).where(eq(articles.status, 'pending_review')),
      db.select({ flagged: count() }).from(articles).where(
        or(
          sql`${articles.qualityScore} < 50`,
          sql`${articles.downvotes} > ${articles.upvotes}`
        )
      ),
      db.select({ published: count() }).from(articles).where(eq(articles.status, 'published')),
    ]);

    return {
      totalUsers: Number(totalUsers),
      activeUsers: Number(activeUsers),
      totalArticles: Number(totalArticles),
      pendingReview: Number(pendingReview),
      flagged: Number(flagged),
      published: Number(published),
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch admin stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========== COMMENT QUERIES ==========

/**
 * Get comments for an article, organized as threaded tree
 * @param articleId Article ID
 * @param excludeUserIds Optional array of user IDs to exclude (e.g., blocked users)
 */
export async function getCommentsByArticle(
  articleId: number, 
  excludeUserIds?: number[]
): Promise<ThreadedComment[]> {
  try {
    const { comments, users } = await import('./schema/index');
    
    // Build where clause
    const conditions = [eq(comments.articleId, articleId)];
    
    if (excludeUserIds && excludeUserIds.length > 0) {
      conditions.push(not(inArray(comments.userId, excludeUserIds)));
    }
    
    // Get all comments for the article
    const allComments = await db
      .select({
        id: comments.id,
        articleId: comments.articleId,
        userId: comments.userId,
        parentId: comments.parentId,
        content: comments.content,
        createdAt: comments.createdAt,
        updatedAt: comments.updatedAt,
        authorId: users.id,
        authorName: users.name,
        authorImage: users.image,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(comments.createdAt));

    // Build threaded structure
    const commentMap = new Map<number, ThreadedComment>();
    const rootComments: ThreadedComment[] = [];

    // First pass: create all comment objects
    for (const row of allComments) {
      const comment: ThreadedComment = {
        id: row.id,
        articleId: row.articleId,
        userId: row.userId,
        parentId: row.parentId,
        content: row.content,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        author: row.authorId ? {
          id: row.authorId,
          name: row.authorName,
          image: row.authorImage,
        } : undefined,
        replies: [],
      };
      commentMap.set(comment.id, comment);
    }

    // Second pass: build tree structure
    for (const comment of commentMap.values()) {
      if (comment.parentId) {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          if (!parent.replies) {
            parent.replies = [];
          }
          parent.replies.push(comment);
        }
      } else {
        rootComments.push(comment);
      }
    }

    return rootComments;
  } catch (error) {
    throw new DatabaseError(`Failed to fetch comments: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a new comment
 */
export async function createComment(data: {
  articleId: number;
  userId: number;
  parentId?: number | null;
  content: string;
}): Promise<Comment> {
  try {
    const { comments } = await import('./schema/index');
    
    const [comment] = await db
      .insert(comments)
      .values({
        articleId: data.articleId,
        userId: data.userId,
        parentId: data.parentId || null,
        content: data.content,
      })
      .returning();

    // Trigger webhook
    await triggerWebhookEvent('comment.created', {
      id: comment.id,
      articleId: comment.articleId,
      userId: comment.userId,
    });

    return comment;
  } catch (error) {
    throw new DatabaseError(`Failed to create comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update a comment
 * @throws {NotFoundError} If comment is not found
 * @throws {ValidationError} If user is not the author
 */
export async function updateComment(
  id: number,
  content: string,
  userId: number
): Promise<Comment> {
  try {
    const { comments } = await import('./schema/index');
    
    // Check if comment exists and belongs to user
    const [existing] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Comment', `id:${id}`);
    }

    if (existing.userId !== userId) {
      throw new ValidationError('You can only edit your own comments');
    }

    const [comment] = await db
      .update(comments)
      .set({
        content,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, id))
      .returning();

    return comment!;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to update comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a comment
 * @throws {NotFoundError} If comment is not found
 * @throws {ValidationError} If user is not the author
 */
export async function deleteComment(id: number, userId: number): Promise<void> {
  try {
    const { comments } = await import('./schema/index');
    
    // Check if comment exists and belongs to user
    const [existing] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundError('Comment', `id:${id}`);
    }

    if (existing.userId !== userId) {
      throw new ValidationError('You can only delete your own comments');
    }

    await db.delete(comments).where(eq(comments.id, id));

    // Trigger webhook
    await triggerWebhookEvent('comment.deleted', {
      id: existing.id,
      articleId: existing.articleId,
      userId: existing.userId,
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to delete comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========== USER PROFILE QUERIES ==========

/**
 * Get user by username (name) for public profile
 * @throws {NotFoundError} If user is not found
 */
export async function getUserByUsername(username: string) {
  try {
    const { users } = await import('./schema/index');
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.name, username))
      .limit(1);

    if (!user) {
      throw new NotFoundError('User', username);
    }

    return user;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get user by ID
 * @throws {NotFoundError} If user is not found
 */
export async function getUserById(userId: number) {
  try {
    const { users } = await import('./schema/index');
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new NotFoundError('User', `id:${userId}`);
    }

    return user;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get user statistics (article count, votes, etc.)
 */
export async function getUserStats(userId: number) {
  try {
    const { users } = await import('./schema/index');
    
    // Get article counts
    const [
      [{ articleCount }],
      [{ revisionCount }],
      [{ commentCount }],
      [{ totalUpvotes }],
      [{ totalDownvotes }],
    ] = await Promise.all([
      db.select({ articleCount: count() }).from(articles).where(eq(articles.authorId, userId)),
      db.select({ revisionCount: count() }).from(articleRevisions).where(eq(articleRevisions.editorId, userId)),
      db.select({ commentCount: count() }).from(comments).where(eq(comments.userId, userId)),
      db.select({ totalUpvotes: sql<number>`COALESCE(SUM(${articles.upvotes}), 0)` }).from(articles).where(eq(articles.authorId, userId)),
      db.select({ totalDownvotes: sql<number>`COALESCE(SUM(${articles.downvotes}), 0)` }).from(articles).where(eq(articles.authorId, userId)),
    ]);

    return {
      articleCount: Number(articleCount),
      revisionCount: Number(revisionCount),
      commentCount: Number(commentCount),
      totalUpvotes: Number(totalUpvotes),
      totalDownvotes: Number(totalDownvotes),
      netVotes: Number(totalUpvotes) - Number(totalDownvotes),
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch user stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get user activity feed (recent edits, comments, votes)
 */
export async function getUserActivity(
  userId: number,
  params: { page?: number; limit?: number } = {}
) {
  try {
    const { users, comments } = await import('./schema/index');
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    // Get recent article revisions
    const revisions = await db
      .select({
        type: sql<string>`'edit'`,
        id: articleRevisions.id,
        articleId: articleRevisions.articleId,
        articleTitle: articleRevisions.title,
        timestamp: articleRevisions.createdAt,
        changeType: articleRevisions.changeType,
      })
      .from(articleRevisions)
      .where(eq(articleRevisions.editorId, userId))
      .orderBy(desc(articleRevisions.createdAt))
      .limit(limit)
      .offset(offset);

    // Get recent comments
    const userComments = await db
      .select({
        type: sql<string>`'comment'`,
        id: comments.id,
        articleId: comments.articleId,
        content: comments.content,
        timestamp: comments.createdAt,
      })
      .from(comments)
      .where(eq(comments.userId, userId))
      .orderBy(desc(comments.createdAt))
      .limit(limit)
      .offset(offset);

    // Get recent votes
    const votes = await db
      .select({
        type: sql<string>`'vote'`,
        id: articleUserVotes.id,
        articleId: articleUserVotes.articleId,
        voteType: articleUserVotes.voteType,
        timestamp: articleUserVotes.createdAt,
      })
      .from(articleUserVotes)
      .where(eq(articleUserVotes.editorId, userId))
      .orderBy(desc(articleUserVotes.createdAt))
      .limit(limit)
      .offset(offset);

    // Combine and sort activities
    const activities = [...revisions, ...userComments, ...votes]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, limit);

    // Fetch article titles for comments and votes
    const articleIds = new Set<number>();
    userComments.forEach(c => articleIds.add(c.articleId));
    votes.forEach(v => articleIds.add(v.articleId));

    const articleTitles = new Map<number, string>();
    if (articleIds.size > 0) {
      const articlesData = await db
        .select({ id: articles.id, title: articles.title })
        .from(articles)
        .where(inArray(articles.id, Array.from(articleIds)));
      
      articlesData.forEach(a => articleTitles.set(a.id, a.title));
    }

    // Add article titles to activities
    const enrichedActivities = activities.map(activity => {
      if (activity.type === 'comment' || activity.type === 'vote') {
        return {
          ...activity,
          articleTitle: articleTitles.get(activity.articleId) || 'Unknown Article',
        };
      }
      return activity;
    });

    return {
      data: enrichedActivities,
      meta: {
        total: enrichedActivities.length,
        page,
        limit,
        totalPages: 1,
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch user activity: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update user profile
 * @throws {NotFoundError} If user is not found
 */
export async function updateUserProfile(
  userId: number,
  updates: {
    name?: string;
    bio?: string;
    image?: string;
    showActivity?: boolean;
    showBadges?: boolean;
  }
) {
  try {
    const { users } = await import('./schema/index');
    
    const [user] = await db
      .update(users)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!user) {
      throw new NotFoundError('User', `id:${userId}`);
    }

    return user;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to update user profile: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========== FOLLOW QUERIES ==========

/**
 * Follow a user
 * @throws {ValidationError} If trying to follow self or already following
 */
export async function followUser(followerId: number, followingId: number): Promise<void> {
  try {
    const { follows } = await import('./schema/index');
    
    // Can't follow yourself
    if (followerId === followingId) {
      throw new ValidationError('Cannot follow yourself');
    }

    // Check if already following
    const [existing] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        )
      )
      .limit(1);

    if (existing) {
      throw new ValidationError('Already following this user');
    }

    // Create follow relationship
    await db.insert(follows).values({
      followerId,
      followingId,
    });

    // Trigger webhook
    await triggerWebhookEvent('user.followed', {
      followerId,
      followingId,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to follow user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Unfollow a user
 * @throws {ValidationError} If not following the user
 */
export async function unfollowUser(followerId: number, followingId: number): Promise<void> {
  try {
    const { follows } = await import('./schema/index');
    
    const [existing] = await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        )
      )
      .returning();

    if (!existing) {
      throw new ValidationError('Not following this user');
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to unfollow user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a user is following another user
 */
export async function isFollowing(followerId: number, followingId: number): Promise<boolean> {
  try {
    const { follows } = await import('./schema/index');
    
    const [follow] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        )
      )
      .limit(1);

    return !!follow;
  } catch (error) {
    throw new DatabaseError(`Failed to check follow status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get followers of a user
 */
export async function getFollowers(
  userId: number,
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<{
  id: number;
  name: string | null;
  image: string | null;
  bio: string | null;
  followedAt: Date;
}>> {
  try {
    const { follows, users } = await import('./schema/index');
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          image: users.image,
          bio: users.bio,
          followedAt: follows.createdAt,
        })
        .from(follows)
        .innerJoin(users, eq(follows.followerId, users.id))
        .where(eq(follows.followingId, userId))
        .orderBy(desc(follows.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(follows)
        .where(eq(follows.followingId, userId)),
    ]);

    return {
      data: data.map(d => ({
        ...d,
        followedAt: d.followedAt || new Date(),
      })),
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch followers: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get users that a user is following
 */
export async function getFollowing(
  userId: number,
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<{
  id: number;
  name: string | null;
  image: string | null;
  bio: string | null;
  followedAt: Date;
}>> {
  try {
    const { follows, users } = await import('./schema/index');
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          image: users.image,
          bio: users.bio,
          followedAt: follows.createdAt,
        })
        .from(follows)
        .innerJoin(users, eq(follows.followingId, users.id))
        .where(eq(follows.followerId, userId))
        .orderBy(desc(follows.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(follows)
        .where(eq(follows.followerId, userId)),
    ]);

    return {
      data: data.map(d => ({
        ...d,
        followedAt: d.followedAt || new Date(),
      })),
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch following: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get follower and following counts for a user
 */
export async function getFollowCounts(userId: number): Promise<{
  followersCount: number;
  followingCount: number;
}> {
  try {
    const { follows } = await import('./schema/index');
    
    const [
      [{ followersCount }],
      [{ followingCount }],
    ] = await Promise.all([
      db.select({ followersCount: count() }).from(follows).where(eq(follows.followingId, userId)),
      db.select({ followingCount: count() }).from(follows).where(eq(follows.followerId, userId)),
    ]);

    return {
      followersCount: Number(followersCount),
      followingCount: Number(followingCount),
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch follow counts: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get activity feed from followed users
 */
export async function getFollowingActivityFeed(
  userId: number,
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<{
  type: 'article_created' | 'article_updated' | 'article_published' | 'revision_created' | 'comment' | 'vote';
  articleId: number;
  articleTitle: string;
  userId: number;
  userName: string | null;
  userImage: string | null;
  timestamp: Date;
  details?: any;
}>> {
  try {
    const { follows, articleRevisions, comments: commentsTable, articleUserVotes, users } = await import('./schema/index');
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    // Get list of users that the current user is following
    const followingList = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    if (followingList.length === 0) {
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    const followingIds = followingList.map(f => f.followingId);

    // Get recent revisions from followed users
    const revisions = await db
      .select({
        type: sql<string>`CASE 
          WHEN ${articleRevisions.changeType} = 'created' THEN 'article_created'
          WHEN ${articleRevisions.changeType} = 'published' THEN 'article_published'
          ELSE 'revision_created'
        END`,
        articleId: articleRevisions.articleId,
        articleTitle: articleRevisions.title,
        userId: articleRevisions.editorId,
        timestamp: articleRevisions.createdAt,
        details: sql`json_build_object('changeType', ${articleRevisions.changeType}, 'changeReason', ${articleRevisions.changeReason})`,
      })
      .from(articleRevisions)
      .where(inArray(articleRevisions.editorId, followingIds))
      .orderBy(desc(articleRevisions.createdAt))
      .limit(limit)
      .offset(offset);

    // Get recent comments from followed users
    const userComments = await db
      .select({
        type: sql<string>`'comment'`,
        articleId: commentsTable.articleId,
        userId: commentsTable.userId,
        timestamp: commentsTable.createdAt,
        details: sql`json_build_object('content', ${commentsTable.content})`,
      })
      .from(commentsTable)
      .where(inArray(commentsTable.userId, followingIds))
      .orderBy(desc(commentsTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Get recent votes from followed users
    const votes = await db
      .select({
        type: sql<string>`'vote'`,
        articleId: articleUserVotes.articleId,
        userId: articleUserVotes.editorId,
        timestamp: articleUserVotes.createdAt,
        details: sql`json_build_object('voteType', ${articleUserVotes.voteType})`,
      })
      .from(articleUserVotes)
      .where(inArray(articleUserVotes.editorId, followingIds))
      .orderBy(desc(articleUserVotes.createdAt))
      .limit(limit)
      .offset(offset);

    // Combine all activities
    const allActivities = [...revisions, ...userComments, ...votes]
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, limit);

    // Get user info and article titles for all activities
    const userIds = new Set(allActivities.map(a => a.userId));
    const articleIds = new Set(allActivities.map(a => a.articleId));

    const [usersData, articlesData] = await Promise.all([
      db.select().from(users).where(inArray(users.id, Array.from(userIds))),
      db.select({ id: articles.id, title: articles.title }).from(articles).where(inArray(articles.id, Array.from(articleIds))),
    ]);

    const userMap = new Map(usersData.map(u => [u.id, u]));
    const articleMap = new Map(articlesData.map(a => [a.id, a]));

    // Enrich activities with user and article info
    const enrichedActivities = allActivities.map(activity => {
      const user = userMap.get(activity.userId);
      const article = articleMap.get(activity.articleId);
      
      return {
        type: activity.type as any,
        articleId: activity.articleId,
        articleTitle: article?.title || 'Unknown Article',
        userId: activity.userId,
        userName: user?.name || null,
        userImage: user?.image || null,
        timestamp: activity.timestamp || new Date(),
        details: activity.details,
      };
    });

    return {
      data: enrichedActivities,
      meta: {
        total: enrichedActivities.length,
        page,
        limit,
        totalPages: 1,
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch following activity feed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ========== BOOKMARK QUERIES ==========

/**
 * Toggle a bookmark (add if not bookmarked, remove if bookmarked)
 */
export async function toggleBookmark(
  userId: number,
  articleId: number
): Promise<{ bookmarked: boolean }> {
  try {
    const { bookmarks } = await import('./schema/index');
    
    // Check if article exists
    await getArticleById(articleId);

    // Check if already bookmarked
    const [existing] = await db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          eq(bookmarks.articleId, articleId)
        )
      )
      .limit(1);

    if (existing) {
      // Remove bookmark
      await db
        .delete(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.articleId, articleId)
          )
        );
      
      return { bookmarked: false };
    } else {
      // Add bookmark
      await db.insert(bookmarks).values({
        userId,
        articleId,
      });
      
      return { bookmarked: true };
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to toggle bookmark: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get user's bookmarks with pagination
 */
export async function getUserBookmarks(
  userId: number,
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<Article & { bookmarkedAt: Date }>> {
  try {
    const { bookmarks } = await import('./schema/index');
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: articles.id,
          slug: articles.slug,
          title: articles.title,
          content: articles.content,
          excerpt: articles.excerpt,
          categoryId: articles.categoryId,
          tags: articles.tags,
          status: articles.status,
          authorId: articles.authorId,
          qualityScore: articles.qualityScore,
          viewCount: articles.viewCount,
          upvotes: articles.upvotes,
          downvotes: articles.downvotes,
          createdAt: articles.createdAt,
          updatedAt: articles.updatedAt,
          publishedAt: articles.publishedAt,
          bookmarkedAt: bookmarks.createdAt,
        })
        .from(bookmarks)
        .innerJoin(articles, eq(bookmarks.articleId, articles.id))
        .where(eq(bookmarks.userId, userId))
        .orderBy(desc(bookmarks.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(bookmarks)
        .where(eq(bookmarks.userId, userId)),
    ]);

    return {
      data: data.map(d => ({
        ...d,
        bookmarkedAt: d.bookmarkedAt || new Date(),
      })),
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch bookmarks: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if an article is bookmarked by a user
 */
export async function isBookmarked(
  userId: number,
  articleId: number
): Promise<boolean> {
  try {
    const { bookmarks } = await import('./schema/index');
    
    const [bookmark] = await db
      .select()
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, userId),
          eq(bookmarks.articleId, articleId)
        )
      )
      .limit(1);

    return !!bookmark;
  } catch (error) {
    throw new DatabaseError(`Failed to check bookmark: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============ Notification Queries ============

export async function getNotifications(
  userId: number,
  params: { page?: number; limit?: number; unreadOnly?: boolean } = {}
): Promise<PaginatedResult<Notification>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [eq(notifications.userId, userId)];
    if (params.unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    const whereClause = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(notifications).where(whereClause)
        .orderBy(desc(notifications.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(notifications).where(whereClause),
    ]);

    return {
      data,
      meta: { total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getUnreadNotificationCount(userId: number): Promise<number> {
  try {
    const [{ count: unreadCount }] = await db.select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return Number(unreadCount);
  } catch (error) {
    throw new DatabaseError(`Failed to fetch unread count: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function createNotification(data: NewNotification): Promise<Notification> {
  try {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  } catch (error) {
    throw new DatabaseError(`Failed to create notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function markNotificationRead(id: number, userId: number): Promise<Notification> {
  try {
    const [notification] = await db.update(notifications).set({ read: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId))).returning();
    if (!notification) throw new NotFoundError('Notification', `id:${id}`);
    return notification;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new DatabaseError(`Failed to mark notification read: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function markAllNotificationsRead(userId: number): Promise<number> {
  try {
    const result = await db.update(notifications).set({ read: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false))).returning();
    return result.length;
  } catch (error) {
    throw new DatabaseError(`Failed to mark all read: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============ Mention Queries ============

/**
 * Get mentions for a user (notifications of type 'mention')
 */
export async function getMentions(
  userId: number,
  params: { page?: number; limit?: number; unreadOnly?: boolean } = {}
): Promise<PaginatedResult<Notification>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(notifications.userId, userId),
      eq(notifications.type, 'mention')
    ];
    if (params.unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    const whereClause = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db.select().from(notifications).where(whereClause)
        .orderBy(desc(notifications.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(notifications).where(whereClause),
    ]);

    return {
      data,
      meta: { total: Number(total), page, limit, totalPages: Math.ceil(Number(total) / limit) },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch mentions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get unread mention count for a user
 */
export async function getUnreadMentionCount(userId: number): Promise<number> {
  try {
    const [{ count: unreadCount }] = await db.select({ count: count() })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.type, 'mention'),
        eq(notifications.read, false)
      ));
    return Number(unreadCount);
  } catch (error) {
    throw new DatabaseError(`Failed to fetch unread mention count: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Mark a mention as read
 */
export async function markMentionRead(id: number, userId: number): Promise<Notification> {
  try {
    const [notification] = await db.update(notifications).set({ read: true })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        eq(notifications.type, 'mention')
      ))
      .returning();
    if (!notification) throw new NotFoundError('Mention', `id:${id}`);
    return notification;
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    throw new DatabaseError(`Failed to mark mention read: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create mention notifications for multiple users
 */
export async function createMentionNotifications(
  mentionedUserIds: number[],
  data: {
    title: string;
    content: string;
    mentionedByUserId: number;
    articleId?: number;
    commentId?: number;
    articleSlug?: string;
  }
): Promise<Notification[]> {
  try {
    const notifications_data = mentionedUserIds.map(userId => ({
      userId,
      type: 'mention' as const,
      title: data.title,
      content: data.content,
      data: {
        mentionedByUserId: data.mentionedByUserId,
        articleId: data.articleId,
        commentId: data.commentId,
        articleSlug: data.articleSlug,
      },
    }));

    const created = await db.insert(notifications).values(notifications_data).returning();
    return created;
  } catch (error) {
    throw new DatabaseError(`Failed to create mention notifications: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============ Tag Queries ============

/**
 * Get all tags
 */
export async function getTags(): Promise<Tag[]> {
  try {
    return await db
      .select()
      .from(tags)
      .orderBy(tags.name);
  } catch (error) {
    throw new DatabaseError(`Failed to fetch tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get tag by slug
 */
export async function getTagBySlug(slug: string): Promise<Tag> {
  try {
    const [tag] = await db
      .select()
      .from(tags)
      .where(eq(tags.slug, slug))
      .limit(1);

    if (!tag) {
      throw new NotFoundError('Tag', slug);
    }

    return tag;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get tag by ID
 */
export async function getTagById(id: number): Promise<Tag> {
  try {
    const [tag] = await db
      .select()
      .from(tags)
      .where(eq(tags.id, id))
      .limit(1);

    if (!tag) {
      throw new NotFoundError('Tag', `id:${id}`);
    }

    return tag;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Create a new tag
 */
export async function createTag(data: NewTag): Promise<Tag> {
  try {
    const [tag] = await db
      .insert(tags)
      .values(data)
      .returning();

    return tag;
  } catch (error) {
    throw new DatabaseError(`Failed to create tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get tags for an article
 */
export async function getArticleTags(articleId: number): Promise<Tag[]> {
  try {
    const result = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        createdAt: tags.createdAt,
      })
      .from(article_tags)
      .innerJoin(tags, eq(article_tags.tagId, tags.id))
      .where(eq(article_tags.articleId, articleId))
      .orderBy(tags.name);

    return result;
  } catch (error) {
    throw new DatabaseError(`Failed to fetch article tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Add a tag to an article
 */
export async function addTagToArticle(articleId: number, tagId: number): Promise<void> {
  try {
    // Verify article exists
    await getArticleById(articleId);
    
    // Verify tag exists
    await getTagById(tagId);

    // Check if already tagged
    const [existing] = await db
      .select()
      .from(article_tags)
      .where(
        and(
          eq(article_tags.articleId, articleId),
          eq(article_tags.tagId, tagId)
        )
      )
      .limit(1);

    if (existing) {
      throw new ValidationError('Article already has this tag');
    }

    // Add tag
    await db.insert(article_tags).values({
      articleId,
      tagId,
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to add tag to article: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Remove a tag from an article
 */
export async function removeTagFromArticle(articleId: number, tagId: number): Promise<void> {
  try {
    const [deleted] = await db
      .delete(article_tags)
      .where(
        and(
          eq(article_tags.articleId, articleId),
          eq(article_tags.tagId, tagId)
        )
      )
      .returning();

    if (!deleted) {
      throw new ValidationError('Article does not have this tag');
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to remove tag from article: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get articles by tag slug with pagination
 */
export async function getArticlesByTag(
  tagSlug: string,
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<Article>> {
  try {
    const tag = await getTagBySlug(tagSlug);
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: articles.id,
          slug: articles.slug,
          title: articles.title,
          content: articles.content,
          excerpt: articles.excerpt,
          categoryId: articles.categoryId,
          tags: articles.tags,
          status: articles.status,
          authorId: articles.authorId,
          qualityScore: articles.qualityScore,
          viewCount: articles.viewCount,
          upvotes: articles.upvotes,
          downvotes: articles.downvotes,
          createdAt: articles.createdAt,
          updatedAt: articles.updatedAt,
          publishedAt: articles.publishedAt,
        })
        .from(article_tags)
        .innerJoin(articles, eq(article_tags.articleId, articles.id))
        .where(eq(article_tags.tagId, tag.id))
        .orderBy(desc(articles.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(article_tags)
        .where(eq(article_tags.tagId, tag.id)),
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
    throw new DatabaseError(`Failed to fetch articles by tag: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============ Edit Suggestion Queries ============

/**
 * Create an edit suggestion
 */
export async function createEditSuggestion(data: NewEditSuggestion): Promise<EditSuggestion> {
  try {
    const { users } = await import('./schema/index');
    
    // Verify article exists
    await getArticleById(data.articleId);
    
    // Verify user exists
    const [user] = await db.select().from(users).where(eq(users.id, data.userId)).limit(1);
    if (!user) {
      throw new NotFoundError('User', `id:${data.userId}`);
    }
    
    const [suggestion] = await db.insert(edit_suggestions).values(data).returning();
    return suggestion;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to create edit suggestion: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get edit suggestions for an article
 */
export async function getEditSuggestionsByArticle(
  articleId: number,
  params: { page?: number; limit?: number; status?: 'pending' | 'approved' | 'rejected' } = {}
): Promise<PaginatedResult<EditSuggestionWithUser>> {
  try {
    const { users } = await import('./schema/index');
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [eq(edit_suggestions.articleId, articleId)];
    if (params.status) {
      conditions.push(eq(edit_suggestions.status, params.status));
    }
    
    const whereClause = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: edit_suggestions.id,
          articleId: edit_suggestions.articleId,
          userId: edit_suggestions.userId,
          fieldName: edit_suggestions.fieldName,
          oldValue: edit_suggestions.oldValue,
          newValue: edit_suggestions.newValue,
          reason: edit_suggestions.reason,
          status: edit_suggestions.status,
          createdAt: edit_suggestions.createdAt,
          user: {
            id: users.id,
            name: users.name,
            image: users.image,
          },
        })
        .from(edit_suggestions)
        .innerJoin(users, eq(edit_suggestions.userId, users.id))
        .where(whereClause)
        .orderBy(desc(edit_suggestions.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(edit_suggestions)
        .where(whereClause),
    ]);

    return {
      data: data as EditSuggestionWithUser[],
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch edit suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get all pending edit suggestions (for admin queue)
 */
export async function getAllEditSuggestions(
  params: { page?: number; limit?: number; status?: 'pending' | 'approved' | 'rejected' } = {}
): Promise<PaginatedResult<EditSuggestionWithUser & { article: { id: number; slug: string; title: string } }>> {
  try {
    const { users } = await import('./schema/index');
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (params.status) {
      conditions.push(eq(edit_suggestions.status, params.status));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: edit_suggestions.id,
          articleId: edit_suggestions.articleId,
          userId: edit_suggestions.userId,
          fieldName: edit_suggestions.fieldName,
          oldValue: edit_suggestions.oldValue,
          newValue: edit_suggestions.newValue,
          reason: edit_suggestions.reason,
          status: edit_suggestions.status,
          createdAt: edit_suggestions.createdAt,
          user: {
            id: users.id,
            name: users.name,
            image: users.image,
          },
          article: {
            id: articles.id,
            slug: articles.slug,
            title: articles.title,
          },
        })
        .from(edit_suggestions)
        .innerJoin(users, eq(edit_suggestions.userId, users.id))
        .innerJoin(articles, eq(edit_suggestions.articleId, articles.id))
        .where(whereClause)
        .orderBy(desc(edit_suggestions.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(edit_suggestions)
        .where(whereClause),
    ]);

    return {
      data: data as any,
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch all edit suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get a single edit suggestion by ID
 */
export async function getEditSuggestionById(id: number): Promise<EditSuggestion> {
  try {
    const [suggestion] = await db
      .select()
      .from(edit_suggestions)
      .where(eq(edit_suggestions.id, id))
      .limit(1);

    if (!suggestion) {
      throw new NotFoundError('Edit suggestion', `id:${id}`);
    }

    return suggestion;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch edit suggestion: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Approve an edit suggestion and apply the edit
 */
export async function approveEditSuggestion(id: number, reviewerId: number): Promise<EditSuggestion> {
  try {
    const suggestion = await getEditSuggestionById(id);
    
    if (suggestion.status !== 'pending') {
      throw new ValidationError('Edit suggestion is not pending');
    }
    
    // Apply the edit to the article
    const article = await getArticleById(suggestion.articleId);
    
    // Map field names to article properties
    const fieldUpdates: Record<string, any> = {};
    
    if (suggestion.fieldName === 'title') {
      fieldUpdates.title = suggestion.newValue;
    } else if (suggestion.fieldName === 'content') {
      fieldUpdates.content = suggestion.newValue;
    } else if (suggestion.fieldName === 'excerpt') {
      fieldUpdates.excerpt = suggestion.newValue;
    } else {
      throw new ValidationError(`Unknown field: ${suggestion.fieldName}`);
    }
    
    // Update the article
    await db
      .update(articles)
      .set({
        ...fieldUpdates,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, suggestion.articleId));
    
    // Create a revision for this change
    const updatedArticle = await getArticleById(suggestion.articleId);
    await db.insert(articleRevisions).values({
      articleId: updatedArticle.id,
      editorId: reviewerId,
      title: updatedArticle.title,
      content: updatedArticle.content!,
      excerpt: updatedArticle.excerpt,
      categoryId: updatedArticle.categoryId,
      tags: updatedArticle.tags || [],
      changeReason: `Edit suggestion #${id} approved: ${suggestion.reason || 'No reason provided'}`,
      changeType: 'updated',
    });
    
    // Mark suggestion as approved
    const [approved] = await db
      .update(edit_suggestions)
      .set({ status: 'approved' })
      .where(eq(edit_suggestions.id, id))
      .returning();
    
    return approved;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to approve edit suggestion: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Reject an edit suggestion
 */
export async function rejectEditSuggestion(id: number): Promise<EditSuggestion> {
  try {
    const suggestion = await getEditSuggestionById(id);
    
    if (suggestion.status !== 'pending') {
      throw new ValidationError('Edit suggestion is not pending');
    }
    
    const [rejected] = await db
      .update(edit_suggestions)
      .set({ status: 'rejected' })
      .where(eq(edit_suggestions.id, id))
      .returning();
    
    return rejected;
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to reject edit suggestion: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============ Email Digest Queries ============

/**
 * Get email digest settings for a user
 */
export async function getEmailDigestSettings(userId: number): Promise<EmailDigestSettings> {
  try {
    const digests = await db
      .select()
      .from(email_digests)
      .where(eq(email_digests.userId, userId));

    const dailyDigest = digests.find(d => d.type === 'daily');
    const weeklyDigest = digests.find(d => d.type === 'weekly');

    return {
      dailyEnabled: dailyDigest?.enabled ?? false,
      weeklyEnabled: weeklyDigest?.enabled ?? false,
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch email digest settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update email digest settings for a user
 */
export async function updateEmailDigestSettings(
  userId: number,
  settings: Partial<EmailDigestSettings>
): Promise<EmailDigestSettings> {
  try {
    // Get existing settings
    const existing = await db
      .select()
      .from(email_digests)
      .where(eq(email_digests.userId, userId));

    const dailyDigest = existing.find(d => d.type === 'daily');
    const weeklyDigest = existing.find(d => d.type === 'weekly');

    // Update or create daily digest
    if (settings.dailyEnabled !== undefined) {
      if (dailyDigest) {
        await db
          .update(email_digests)
          .set({ 
            enabled: settings.dailyEnabled,
            updatedAt: new Date(),
          })
          .where(eq(email_digests.id, dailyDigest.id));
      } else {
        await db.insert(email_digests).values({
          userId,
          type: 'daily',
          enabled: settings.dailyEnabled,
        });
      }
    }

    // Update or create weekly digest
    if (settings.weeklyEnabled !== undefined) {
      if (weeklyDigest) {
        await db
          .update(email_digests)
          .set({ 
            enabled: settings.weeklyEnabled,
            updatedAt: new Date(),
          })
          .where(eq(email_digests.id, weeklyDigest.id));
      } else {
        await db.insert(email_digests).values({
          userId,
          type: 'weekly',
          enabled: settings.weeklyEnabled,
        });
      }
    }

    // Return updated settings
    return await getEmailDigestSettings(userId);
  } catch (error) {
    throw new DatabaseError(`Failed to update email digest settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get users who should receive digests (enabled and due for sending)
 */
export async function getUsersForDigest(type: 'daily' | 'weekly'): Promise<Array<{
  userId: number;
  email: string;
  name: string | null;
}>> {
  try {
    const { users } = await import('./schema/index');
    
    // Calculate the threshold for last sent
    const now = new Date();
    const threshold = type === 'daily'
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    // Get users with enabled digests that are due
    const results = await db
      .select({
        userId: email_digests.userId,
        email: users.email,
        name: users.name,
      })
      .from(email_digests)
      .innerJoin(users, eq(email_digests.userId, users.id))
      .where(
        and(
          eq(email_digests.type, type),
          eq(email_digests.enabled, true),
          or(
            sql`${email_digests.lastSent} IS NULL`,
            lte(email_digests.lastSent, threshold)
          )
        )
      );

    return results;
  } catch (error) {
    throw new DatabaseError(`Failed to get users for digest: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Mark digest as sent for a user
 */
export async function markDigestSent(userId: number, type: 'daily' | 'weekly'): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(email_digests)
      .where(
        and(
          eq(email_digests.userId, userId),
          eq(email_digests.type, type)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(email_digests)
        .set({ 
          lastSent: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(email_digests.id, existing[0].id));
    }
  } catch (error) {
    throw new DatabaseError(`Failed to mark digest sent: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Add email to queue
 */
export async function queueEmail(data: NewEmailQueue): Promise<EmailQueue> {
  try {
    const [email] = await db
      .insert(email_queue)
      .values(data)
      .returning();

    return email;
  } catch (error) {
    throw new DatabaseError(`Failed to queue email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get pending emails from queue
 */
export async function getPendingEmails(limit: number = 100): Promise<EmailQueue[]> {
  try {
    return await db
      .select()
      .from(email_queue)
      .where(eq(email_queue.status, 'pending'))
      .orderBy(email_queue.createdAt)
      .limit(limit);
  } catch (error) {
    throw new DatabaseError(`Failed to get pending emails: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Mark email as sent
 */
export async function markEmailSent(id: number): Promise<void> {
  try {
    await db
      .update(email_queue)
      .set({ 
        status: 'sent',
        sentAt: new Date(),
      })
      .where(eq(email_queue.id, id));
  } catch (error) {
    throw new DatabaseError(`Failed to mark email sent: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Mark email as failed
 */
export async function markEmailFailed(id: number): Promise<void> {
  try {
    await db
      .update(email_queue)
      .set({ status: 'failed' })
      .where(eq(email_queue.id, id));
  } catch (error) {
    throw new DatabaseError(`Failed to mark email failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get digest content for a user
 */
export async function getDigestContent(
  userId: number,
  type: 'daily' | 'weekly'
): Promise<{
  newArticles: Article[];
  followingActivity: any[];
  trendingArticles: Article[];
}> {
  try {
    const { users, follows } = await import('./schema/index');
    
    // Calculate time threshold
    const now = new Date();
    const threshold = type === 'daily'
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get new articles in followed categories (simplified - just get recent published articles)
    const newArticles = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          gte(articles.publishedAt, threshold)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(10);

    // Get activity from followed users
    const followingList = await db
      .select({ followingId: follows.followingId })
      .from(follows)
      .where(eq(follows.followerId, userId));

    let followingActivity: any[] = [];
    if (followingList.length > 0) {
      const followingIds = followingList.map(f => f.followingId);
      
      // Get recent revisions from followed users
      followingActivity = await db
        .select({
          type: sql<string>`'edit'`,
          articleId: articleRevisions.articleId,
          articleTitle: articleRevisions.title,
          userId: articleRevisions.editorId,
          timestamp: articleRevisions.createdAt,
          changeType: articleRevisions.changeType,
        })
        .from(articleRevisions)
        .where(
          and(
            inArray(articleRevisions.editorId, followingIds),
            gte(articleRevisions.createdAt, threshold)
          )
        )
        .orderBy(desc(articleRevisions.createdAt))
        .limit(20);
    }

    // Get trending articles (high view count or upvotes in recent period)
    const trendingArticles = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.status, 'published'),
          gte(articles.createdAt, threshold)
        )
      )
      .orderBy(desc(articles.viewCount))
      .limit(10);

    return {
      newArticles,
      followingActivity,
      trendingArticles,
    };
  } catch (error) {
    throw new DatabaseError(`Failed to get digest content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// Analytics Queries
// ============================================

/**
 * Get traffic overview for the last N days
 */
export async function getTrafficStats(days: number = 7): Promise<{
  date: string;
  views: number;
  visitors: number;
}[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);

  const result = await db.execute(sql`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as views,
      COUNT(DISTINCT visitor_hash) as visitors
    FROM page_views
    WHERE created_at >= ${threshold}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `);

  return result.rows.map(row => ({
    date: row.date as string,
    views: Number(row.views),
    visitors: Number(row.visitors),
  }));
}

/**
 * Get top articles by views
 */
export async function getTopArticlesByViews(
  days: number = 7,
  limit: number = 10
): Promise<{
  articleId: number | null;
  path: string;
  title: string | null;
  views: number;
  uniqueVisitors: number;
  avgReadTime: number | null;
  avgScrollDepth: number | null;
}[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);

  const result = await db.execute(sql`
    SELECT 
      pv.article_id as "articleId",
      pv.path,
      a.title,
      COUNT(*) as views,
      COUNT(DISTINCT pv.visitor_hash) as "uniqueVisitors",
      AVG(pv.read_time_seconds) as "avgReadTime",
      AVG(pv.scroll_depth) as "avgScrollDepth"
    FROM page_views pv
    LEFT JOIN articles a ON pv.article_id = a.id
    WHERE pv.created_at >= ${threshold}
    GROUP BY pv.article_id, pv.path, a.title
    ORDER BY views DESC
    LIMIT ${limit}
  `);

  return result.rows.map(row => ({
    articleId: row.articleId as number | null,
    path: row.path as string,
    title: row.title as string | null,
    views: Number(row.views),
    uniqueVisitors: Number(row.uniqueVisitors),
    avgReadTime: row.avgReadTime ? Number(row.avgReadTime) : null,
    avgScrollDepth: row.avgScrollDepth ? Number(row.avgScrollDepth) : null,
  }));
}

/**
 * Get traffic sources (referrers)
 */
export async function getTrafficSources(
  days: number = 7,
  limit: number = 10
): Promise<{
  referrer: string;
  count: number;
}[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);

  const result = await db.execute(sql`
    SELECT 
      COALESCE(referrer, 'Direct') as referrer,
      COUNT(*) as count
    FROM page_views
    WHERE created_at >= ${threshold}
    GROUP BY referrer
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  return result.rows.map(row => ({
    referrer: row.referrer as string,
    count: Number(row.count),
  }));
}

/**
 * Get geographic distribution
 */
export async function getGeographicDistribution(
  days: number = 7,
  limit: number = 10
): Promise<{
  countryCode: string;
  count: number;
}[]> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);

  const result = await db.execute(sql`
    SELECT 
      COALESCE(country_code, 'Unknown') as "countryCode",
      COUNT(*) as count
    FROM page_views
    WHERE created_at >= ${threshold}
    GROUP BY country_code
    ORDER BY count DESC
    LIMIT ${limit}
  `);

  return result.rows.map(row => ({
    countryCode: row.countryCode as string,
    count: Number(row.count),
  }));
}

/**
 * Get overall stats summary
 */
export async function getAnalyticsSummary(days: number = 7): Promise<{
  totalViews: number;
  uniqueVisitors: number;
  avgReadTime: number | null;
  avgScrollDepth: number | null;
  topPages: number;
}> {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);

  const result = await db.execute(sql`
    SELECT 
      COUNT(*) as "totalViews",
      COUNT(DISTINCT visitor_hash) as "uniqueVisitors",
      AVG(read_time_seconds) as "avgReadTime",
      AVG(scroll_depth) as "avgScrollDepth",
      COUNT(DISTINCT path) as "topPages"
    FROM page_views
    WHERE created_at >= ${threshold}
  `);

  const row = result.rows[0];
  return {
    totalViews: Number(row.totalViews),
    uniqueVisitors: Number(row.uniqueVisitors),
    avgReadTime: row.avgReadTime ? Number(row.avgReadTime) : null,
    avgScrollDepth: row.avgScrollDepth ? Number(row.avgScrollDepth) : null,
    topPages: Number(row.topPages),
  };
}

/**
 * Insert a page view (for analytics tracking)
 */
export async function insertPageView(data: {
  visitorHash: string;
  path: string;
  articleId?: number | null;
  referrer?: string | null;
  userAgent?: string | null;
  countryCode?: string | null;
  readTimeSeconds?: number | null;
  scrollDepth?: number | null;
}): Promise<void> {
  await db.insert(page_views).values({
    visitorHash: data.visitorHash,
    path: data.path,
    articleId: data.articleId ?? null,
    referrer: data.referrer ?? null,
    userAgent: data.userAgent ?? null,
    countryCode: data.countryCode ?? null,
    readTimeSeconds: data.readTimeSeconds ?? null,
    scrollDepth: data.scrollDepth ?? null,
  });
}

// ============================================
// Audit Log Queries
// ============================================

import { audit_logs } from './schema/index';
import type { AuditLog, NewAuditLog, AuditLogWithUser, AuditLogQueryParams } from './types';

/**
 * Create an audit log entry
 */
export async function createAuditLog(data: NewAuditLog): Promise<AuditLog> {
  try {
    const [log] = await db
      .insert(audit_logs)
      .values(data)
      .returning();

    return log;
  } catch (error) {
    throw new DatabaseError(`Failed to create audit log: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get audit logs with filtering and pagination
 */
export async function getAuditLogs(
  params: AuditLogQueryParams = {}
): Promise<PaginatedResult<AuditLogWithUser>> {
  try {
    const { users } = await import('./schema/index');
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [];

    if (params.userId) {
      conditions.push(eq(audit_logs.userId, params.userId));
    }

    if (params.action) {
      conditions.push(eq(audit_logs.action, params.action));
    }

    if (params.resourceType) {
      conditions.push(eq(audit_logs.resourceType, params.resourceType));
    }

    if (params.dateFrom) {
      conditions.push(gte(audit_logs.createdAt, new Date(params.dateFrom)));
    }

    if (params.dateTo) {
      // Add one day to include the end date fully
      const endDate = new Date(params.dateTo);
      endDate.setDate(endDate.getDate() + 1);
      conditions.push(lte(audit_logs.createdAt, endDate));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: audit_logs.id,
          userId: audit_logs.userId,
          action: audit_logs.action,
          resourceType: audit_logs.resourceType,
          resourceId: audit_logs.resourceId,
          details: audit_logs.details,
          ipAddress: audit_logs.ipAddress,
          userAgent: audit_logs.userAgent,
          createdAt: audit_logs.createdAt,
          user: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(audit_logs)
        .leftJoin(users, eq(audit_logs.userId, users.id))
        .where(whereClause)
        .orderBy(desc(audit_logs.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(audit_logs)
        .where(whereClause),
    ]);

    return {
      data: data as AuditLogWithUser[],
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get audit logs for a specific resource
 */
export async function getAuditLogsByResource(
  resourceType: string,
  resourceId: string,
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<AuditLogWithUser>> {
  try {
    const { users } = await import('./schema/index');
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: audit_logs.id,
          userId: audit_logs.userId,
          action: audit_logs.action,
          resourceType: audit_logs.resourceType,
          resourceId: audit_logs.resourceId,
          details: audit_logs.details,
          ipAddress: audit_logs.ipAddress,
          userAgent: audit_logs.userAgent,
          createdAt: audit_logs.createdAt,
          user: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(audit_logs)
        .leftJoin(users, eq(audit_logs.userId, users.id))
        .where(
          and(
            eq(audit_logs.resourceType, resourceType),
            eq(audit_logs.resourceId, resourceId)
          )
        )
        .orderBy(desc(audit_logs.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(audit_logs)
        .where(
          and(
            eq(audit_logs.resourceType, resourceType),
            eq(audit_logs.resourceId, resourceId)
          )
        ),
    ]);

    return {
      data: data as AuditLogWithUser[],
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch audit logs by resource: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get distinct audit actions (for filter dropdown)
 */
export async function getAuditActions(): Promise<string[]> {
  try {
    const result = await db
      .selectDistinct({ action: audit_logs.action })
      .from(audit_logs)
      .orderBy(audit_logs.action);

    return result.map(r => r.action);
  } catch (error) {
    throw new DatabaseError(`Failed to fetch audit actions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get distinct resource types (for filter dropdown)
 */
export async function getAuditResourceTypes(): Promise<string[]> {
  try {
    const result = await db
      .selectDistinct({ resourceType: audit_logs.resourceType })
      .from(audit_logs)
      .orderBy(audit_logs.resourceType);

    return result.map(r => r.resourceType);
  } catch (error) {
    throw new DatabaseError(`Failed to fetch audit resource types: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// System Settings Queries
// ============================================

import { system_settings } from './schema/index';
import type { SystemSetting, MaintenanceModeSettings, NewSystemSetting } from './types';

/**
 * Get a system setting by key
 */
export async function getSystemSetting<T = Record<string, unknown>>(key: string): Promise<T | null> {
  try {
    const [setting] = await db
      .select()
      .from(system_settings)
      .where(eq(system_settings.key, key))
      .limit(1);

    return setting ? (setting.value as T) : null;
  } catch (error) {
    throw new DatabaseError(`Failed to fetch system setting: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Set a system setting
 */
export async function setSystemSetting(
  key: string, 
  value: Record<string, unknown>,
  updatedBy?: number
): Promise<SystemSetting> {
  try {
    // Use upsert pattern
    const [setting] = await db
      .insert(system_settings)
      .values({ key, value, updatedBy: updatedBy ?? null })
      .onConflictDoUpdate({
        target: system_settings.key,
        set: {
          value,
          updatedAt: new Date(),
          updatedBy: updatedBy ?? null,
        },
      })
      .returning();

    return setting;
  } catch (error) {
    throw new DatabaseError(`Failed to set system setting: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get maintenance mode settings
 */
export async function getMaintenanceModeSettings(): Promise<MaintenanceModeSettings> {
  const defaultSettings: MaintenanceModeSettings = {
    enabled: false,
    message: 'We are currently performing scheduled maintenance. Please check back soon.',
    estimatedTime: '',
    contactEmail: '',
  };

  try {
    const settings = await getSystemSetting<MaintenanceModeSettings>('maintenance_mode');
    return settings ? { ...defaultSettings, ...settings } : defaultSettings;
  } catch (error) {
    // If table doesn't exist or other error, return defaults
    console.error('Error fetching maintenance settings:', error);
    return defaultSettings;
  }
}

/**
 * Update maintenance mode settings
 */
export async function setMaintenanceModeSettings(
  settings: Partial<MaintenanceModeSettings>,
  updatedBy?: number
): Promise<MaintenanceModeSettings> {
  try {
    const currentSettings = await getMaintenanceModeSettings();
    const newSettings = { ...currentSettings, ...settings };
    
    await setSystemSetting('maintenance_mode', newSettings as unknown as Record<string, unknown>, updatedBy);
    
    return newSettings;
  } catch (error) {
    throw new DatabaseError(`Failed to update maintenance settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============ Content Reports ============

/**
 * Create a new content report
 */
export async function createContentReport(report: NewContentReport): Promise<ContentReport> {
  try {
    const [newReport] = await db
      .insert(content_reports)
      .values(report)
      .returning();

    return newReport;
  } catch (error) {
    throw new DatabaseError(`Failed to create content report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get a content report by ID
 */
export async function getContentReportById(id: number): Promise<ContentReportWithDetails> {
  try {
    const [report] = await db
      .select()
      .from(content_reports)
      .where(eq(content_reports.id, id))
      .limit(1);

    if (!report) {
      throw new NotFoundError('ContentReport', `id:${id}`);
    }

    // Get reporter details
    const [reporter] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, report.reporterId))
      .limit(1);

    // Get reviewer details if exists
    let reviewer = null;
    if (report.reviewedBy) {
      const [reviewerData] = await db
        .select({
          id: users.id,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, report.reviewedBy))
        .limit(1);
      reviewer = reviewerData || null;
    }

    // Get content details based on type
    let content = null;
    if (report.contentType === 'article') {
      const [article] = await db
        .select({
          id: articles.id,
          title: articles.title,
          excerpt: articles.excerpt,
        })
        .from(articles)
        .where(eq(articles.id, report.contentId))
        .limit(1);
      if (article) {
        content = {
          type: 'article' as const,
          ...article,
        };
      }
    } else if (report.contentType === 'comment') {
      const [comment] = await db
        .select({
          id: comments.id,
          excerpt: comments.content,
        })
        .from(comments)
        .where(eq(comments.id, report.contentId))
        .limit(1);
      if (comment) {
        content = {
          type: 'comment' as const,
          ...comment,
        };
      }
    }

    return {
      ...report,
      reporter: reporter!,
      reviewer,
      content: content || undefined,
    };
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to fetch content report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List content reports with filtering and pagination
 */
export async function listContentReports(
  params: ContentReportQueryParams = {}
): Promise<PaginatedResult<ContentReportWithDetails>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    // Build conditions
    const conditions = [];
    
    if (params.status) {
      conditions.push(eq(content_reports.status, params.status));
    }
    
    if (params.reason) {
      conditions.push(eq(content_reports.reason, params.reason));
    }
    
    if (params.contentType) {
      conditions.push(eq(content_reports.contentType, params.contentType));
    }
    
    if (params.reporterId) {
      conditions.push(eq(content_reports.reporterId, params.reporterId));
    }

    // Get total count
    const countQuery = db
      .select({ count: count() })
      .from(content_reports);
    
    const [{ count: total }] = conditions.length > 0
      ? await countQuery.where(and(...conditions))
      : await countQuery;

    // Get reports
    const reportsQuery = db
      .select()
      .from(content_reports)
      .orderBy(desc(content_reports.createdAt))
      .limit(limit)
      .offset(offset);
    
    const reports = conditions.length > 0
      ? await reportsQuery.where(and(...conditions))
      : await reportsQuery;

    // Enrich with details
    const enrichedReports = await Promise.all(
      reports.map(async (report) => {
        // Get reporter details
        const [reporter] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
          })
          .from(users)
          .where(eq(users.id, report.reporterId))
          .limit(1);

        // Get reviewer details if exists
        let reviewer = null;
        if (report.reviewedBy) {
          const [reviewerData] = await db
            .select({
              id: users.id,
              name: users.name,
            })
            .from(users)
            .where(eq(users.id, report.reviewedBy))
            .limit(1);
          reviewer = reviewerData || null;
        }

        // Get content details based on type
        let content = null;
        if (report.contentType === 'article') {
          const [article] = await db
            .select({
              id: articles.id,
              title: articles.title,
              excerpt: articles.excerpt,
            })
            .from(articles)
            .where(eq(articles.id, report.contentId))
            .limit(1);
          if (article) {
            content = {
              type: 'article' as const,
              ...article,
            };
          }
        } else if (report.contentType === 'comment') {
          const [comment] = await db
            .select({
              id: comments.id,
              excerpt: comments.content,
            })
            .from(comments)
            .where(eq(comments.id, report.contentId))
            .limit(1);
          if (comment) {
            content = {
              type: 'comment' as const,
              ...comment,
            };
          }
        }

        return {
          ...report,
          reporter: reporter!,
          reviewer,
          content: content || undefined,
        };
      })
    );

    return {
      data: enrichedReports,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to list content reports: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Update content report status
 */
export async function updateContentReportStatus(
  id: number,
  status: ReportStatus,
  reviewedBy: number
): Promise<ContentReport> {
  try {
    const [updated] = await db
      .update(content_reports)
      .set({
        status,
        reviewedBy,
        reviewedAt: new Date(),
      })
      .where(eq(content_reports.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundError('ContentReport', `id:${id}`);
    }

    return updated;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    throw new DatabaseError(`Failed to update content report: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// User Block Queries
// ============================================

/**
 * Block a user
 * @throws {ValidationError} If trying to block self or already blocked
 */
export async function blockUser(blockerId: number, blockedId: number): Promise<void> {
  try {
    const { user_blocks } = await import('./schema/index');
    
    // Can't block yourself
    if (blockerId === blockedId) {
      throw new ValidationError('Cannot block yourself');
    }

    // Check if already blocked
    const [existing] = await db
      .select()
      .from(user_blocks)
      .where(
        and(
          eq(user_blocks.blockerId, blockerId),
          eq(user_blocks.blockedId, blockedId)
        )
      )
      .limit(1);

    if (existing) {
      throw new ValidationError('Already blocked this user');
    }

    // Create block relationship
    await db.insert(user_blocks).values({
      blockerId,
      blockedId,
    });

    // Remove any existing follow relationships between the users
    const { follows } = await import('./schema/index');
    
    // Remove follower relationship if exists
    await db
      .delete(follows)
      .where(
        or(
          and(
            eq(follows.followerId, blockerId),
            eq(follows.followingId, blockedId)
          ),
          and(
            eq(follows.followerId, blockedId),
            eq(follows.followingId, blockerId)
          )
        )
      );
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to block user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Unblock a user
 * @throws {ValidationError} If not blocking the user
 */
export async function unblockUser(blockerId: number, blockedId: number): Promise<void> {
  try {
    const { user_blocks } = await import('./schema/index');
    
    const [existing] = await db
      .delete(user_blocks)
      .where(
        and(
          eq(user_blocks.blockerId, blockerId),
          eq(user_blocks.blockedId, blockedId)
        )
      )
      .returning();

    if (!existing) {
      throw new ValidationError('Not blocking this user');
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to unblock user: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a user has blocked another user
 */
export async function isBlocking(blockerId: number, blockedId: number): Promise<boolean> {
  try {
    const { user_blocks } = await import('./schema/index');
    
    const [block] = await db
      .select()
      .from(user_blocks)
      .where(
        and(
          eq(user_blocks.blockerId, blockerId),
          eq(user_blocks.blockedId, blockedId)
        )
      )
      .limit(1);

    return !!block;
  } catch (error) {
    throw new DatabaseError(`Failed to check block status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if either user has blocked the other (mutual block check)
 */
export async function hasBlockBetween(userId1: number, userId2: number): Promise<boolean> {
  try {
    const { user_blocks } = await import('./schema/index');
    
    const [block] = await db
      .select()
      .from(user_blocks)
      .where(
        or(
          and(
            eq(user_blocks.blockerId, userId1),
            eq(user_blocks.blockedId, userId2)
          ),
          and(
            eq(user_blocks.blockerId, userId2),
            eq(user_blocks.blockedId, userId1)
          )
        )
      )
      .limit(1);

    return !!block;
  } catch (error) {
    throw new DatabaseError(`Failed to check mutual block status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get list of users blocked by a user
 */
export async function getBlockedUsers(
  userId: number,
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<{
  id: number;
  name: string | null;
  image: string | null;
  bio: string | null;
  blockedAt: Date;
}>> {
  try {
    const { user_blocks, users } = await import('./schema/index');
    
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          image: users.image,
          bio: users.bio,
          blockedAt: user_blocks.createdAt,
        })
        .from(user_blocks)
        .innerJoin(users, eq(user_blocks.blockedId, users.id))
        .where(eq(user_blocks.blockerId, userId))
        .orderBy(desc(user_blocks.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(user_blocks)
        .where(eq(user_blocks.blockerId, userId)),
    ]);

    return {
      data: data.map(d => ({
        ...d,
        blockedAt: d.blockedAt || new Date(),
      })),
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch blocked users: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get list of blocked user IDs for a user (for filtering queries)
 */
export async function getBlockedUserIds(userId: number): Promise<number[]> {
  try {
    const { user_blocks } = await import('./schema/index');
    
    const blocked = await db
      .select({ blockedId: user_blocks.blockedId })
      .from(user_blocks)
      .where(eq(user_blocks.blockerId, userId));

    return blocked.map(b => b.blockedId);
  } catch (error) {
    throw new DatabaseError(`Failed to fetch blocked user IDs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get list of user IDs who have blocked a user (for filtering queries)
 */
export async function getBlockedByUserIds(userId: number): Promise<number[]> {
  try {
    const { user_blocks } = await import('./schema/index');
    
    const blockedBy = await db
      .select({ blockerId: user_blocks.blockerId })
      .from(user_blocks)
      .where(eq(user_blocks.blockedId, userId));

    return blockedBy.map(b => b.blockerId);
  } catch (error) {
    throw new DatabaseError(`Failed to fetch blocked-by user IDs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// Article Reaction Queries
// ============================================

import { article_reactions } from './schema/index';

/**
 * Available reaction emojis
 */
export const AVAILABLE_REACTIONS = ['👍', '❤️', '😲', '🤔', '🎉'] as const;
export type ReactionEmoji = typeof AVAILABLE_REACTIONS[number];

/**
 * Add a reaction to an article
 */
export async function addArticleReaction(
  articleId: number,
  userId: number,
  emoji: string
): Promise<void> {
  try {
    // Validate emoji
    if (!AVAILABLE_REACTIONS.includes(emoji as ReactionEmoji)) {
      throw new ValidationError('Invalid reaction emoji');
    }

    // Check if article exists
    await getArticleById(articleId);

    // Check if reaction already exists
    const [existing] = await db
      .select()
      .from(article_reactions)
      .where(
        and(
          eq(article_reactions.articleId, articleId),
          eq(article_reactions.userId, userId),
          eq(article_reactions.emoji, emoji)
        )
      )
      .limit(1);

    if (existing) {
      throw new ValidationError('Reaction already exists');
    }

    // Add reaction
    await db.insert(article_reactions).values({
      articleId,
      userId,
      emoji,
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to add reaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Remove a reaction from an article
 */
export async function removeArticleReaction(
  articleId: number,
  userId: number,
  emoji: string
): Promise<void> {
  try {
    const [deleted] = await db
      .delete(article_reactions)
      .where(
        and(
          eq(article_reactions.articleId, articleId),
          eq(article_reactions.userId, userId),
          eq(article_reactions.emoji, emoji)
        )
      )
      .returning();

    if (!deleted) {
      throw new ValidationError('Reaction not found');
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to remove reaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get reaction counts for an article
 */
export async function getArticleReactionCounts(articleId: number): Promise<Record<string, number>> {
  try {
    const result = await db
      .select({
        emoji: article_reactions.emoji,
        count: count(),
      })
      .from(article_reactions)
      .where(eq(article_reactions.articleId, articleId))
      .groupBy(article_reactions.emoji);

    const counts: Record<string, number> = {};
    for (const row of result) {
      counts[row.emoji] = Number(row.count);
    }

    // Ensure all available reactions are present in the result
    for (const emoji of AVAILABLE_REACTIONS) {
      if (!(emoji in counts)) {
        counts[emoji] = 0;
      }
    }

    return counts;
  } catch (error) {
    throw new DatabaseError(`Failed to get reaction counts: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get user's reactions for an article
 */
export async function getUserArticleReactions(
  articleId: number,
  userId: number
): Promise<string[]> {
  try {
    const result = await db
      .select({ emoji: article_reactions.emoji })
      .from(article_reactions)
      .where(
        and(
          eq(article_reactions.articleId, articleId),
          eq(article_reactions.userId, userId)
        )
      );

    return result.map(r => r.emoji);
  } catch (error) {
    throw new DatabaseError(`Failed to get user reactions: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Toggle a reaction (add if not exists, remove if exists)
 */
export async function toggleArticleReaction(
  articleId: number,
  userId: number,
  emoji: string
): Promise<{ reacted: boolean }> {
  try {
    // Validate emoji
    if (!AVAILABLE_REACTIONS.includes(emoji as ReactionEmoji)) {
      throw new ValidationError('Invalid reaction emoji');
    }

    // Check if article exists
    await getArticleById(articleId);

    // Check if reaction exists
    const [existing] = await db
      .select()
      .from(article_reactions)
      .where(
        and(
          eq(article_reactions.articleId, articleId),
          eq(article_reactions.userId, userId),
          eq(article_reactions.emoji, emoji)
        )
      )
      .limit(1);

    if (existing) {
      // Remove reaction
      await db
        .delete(article_reactions)
        .where(eq(article_reactions.id, existing.id));
      
      return { reacted: false };
    } else {
      // Add reaction
      await db.insert(article_reactions).values({
        articleId,
        userId,
        emoji,
      });
      
      return { reacted: true };
    }
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      throw error;
    }
    throw new DatabaseError(`Failed to toggle reaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================
// Article Draft Queries
// ============================================

import { article_drafts } from './schema/index';
import type { ArticleDraft, NewArticleDraft, ArticleDraftWithArticle } from './types';

/**
 * Get a draft for an article by a specific user
 */
export async function getArticleDraft(
  articleId: number | null,
  userId: number
): Promise<ArticleDraftWithArticle | null> {
  try {
    if (articleId) {
      // Get draft for existing article
      const [draft] = await db
        .select({
          id: article_drafts.id,
          articleId: article_drafts.articleId,
          userId: article_drafts.userId,
          title: article_drafts.title,
          content: article_drafts.content,
          excerpt: article_drafts.excerpt,
          tags: article_drafts.tags,
          lastSaved: article_drafts.lastSaved,
          createdAt: article_drafts.createdAt,
          article: {
            id: articles.id,
            slug: articles.slug,
            title: articles.title,
            content: articles.content,
            excerpt: articles.excerpt,
          },
        })
        .from(article_drafts)
        .leftJoin(articles, eq(article_drafts.articleId, articles.id))
        .where(
          and(
            eq(article_drafts.articleId, articleId),
            eq(article_drafts.userId, userId)
          )
        )
        .limit(1);

      return draft as ArticleDraftWithArticle || null;
    } else {
      // Get draft for new article (articleId is null)
      const [draft] = await db
        .select({
          id: article_drafts.id,
          articleId: article_drafts.articleId,
          userId: article_drafts.userId,
          title: article_drafts.title,
          content: article_drafts.content,
          excerpt: article_drafts.excerpt,
          tags: article_drafts.tags,
          lastSaved: article_drafts.lastSaved,
          createdAt: article_drafts.createdAt,
          article: sql`null`,
        })
        .from(article_drafts)
        .where(
          and(
            sql`${article_drafts.articleId} IS NULL`,
            eq(article_drafts.userId, userId)
          )
        )
        .limit(1);

      return draft as ArticleDraftWithArticle || null;
    }
  } catch (error) {
    throw new DatabaseError(`Failed to fetch article draft: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Save (create or update) a draft
 */
export async function saveArticleDraft(
  articleId: number | null,
  userId: number,
  data: {
    title?: string;
    content?: string;
    excerpt?: string;
    tags?: string[];
  }
): Promise<ArticleDraft> {
  try {
    // Check if draft already exists
    const existing = await getArticleDraft(articleId, userId);

    if (existing) {
      // Update existing draft
      const [updated] = await db
        .update(article_drafts)
        .set({
          ...data,
          lastSaved: new Date(),
        })
        .where(eq(article_drafts.id, existing.id))
        .returning();

      return updated;
    } else {
      // Create new draft
      const [draft] = await db
        .insert(article_drafts)
        .values({
          articleId: articleId ?? null,
          userId,
          ...data,
        })
        .returning();

      return draft;
    }
  } catch (error) {
    throw new DatabaseError(`Failed to save article draft: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a draft
 */
export async function deleteArticleDraft(
  articleId: number | null,
  userId: number
): Promise<void> {
  try {
    if (articleId) {
      await db
        .delete(article_drafts)
        .where(
          and(
            eq(article_drafts.articleId, articleId),
            eq(article_drafts.userId, userId)
          )
        );
    } else {
      await db
        .delete(article_drafts)
        .where(
          and(
            sql`${article_drafts.articleId} IS NULL`,
            eq(article_drafts.userId, userId)
          )
        );
    }
  } catch (error) {
    throw new DatabaseError(`Failed to delete article draft: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get all drafts for a user
 */
export async function getUserDrafts(
  userId: number,
  params: { page?: number; limit?: number } = {}
): Promise<PaginatedResult<ArticleDraftWithArticle>> {
  try {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: article_drafts.id,
          articleId: article_drafts.articleId,
          userId: article_drafts.userId,
          title: article_drafts.title,
          content: article_drafts.content,
          excerpt: article_drafts.excerpt,
          tags: article_drafts.tags,
          lastSaved: article_drafts.lastSaved,
          createdAt: article_drafts.createdAt,
          article: {
            id: articles.id,
            slug: articles.slug,
            title: articles.title,
            content: articles.content,
            excerpt: articles.excerpt,
          },
        })
        .from(article_drafts)
        .leftJoin(articles, eq(article_drafts.articleId, articles.id))
        .where(eq(article_drafts.userId, userId))
        .orderBy(desc(article_drafts.lastSaved))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count() })
        .from(article_drafts)
        .where(eq(article_drafts.userId, userId)),
    ]);

    return {
      data: data as ArticleDraftWithArticle[],
      meta: {
        total: Number(total),
        page,
        limit,
        totalPages: Math.ceil(Number(total) / limit),
      },
    };
  } catch (error) {
    throw new DatabaseError(`Failed to fetch user drafts: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
