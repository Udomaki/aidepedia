import type { APIRoute } from 'astro';
import { 
  getArticleBySlug, 
  getRevisionById 
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../../../../../lib/api-utils';
import * as Diff from 'diff';

/**
 * GET /api/v1/articles/[slug]/compare/[rev1]/[rev2]
 * Compare two revisions
 * 
 * Returns diff data for title, content, and excerpt
 */
export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug, rev1, rev2 } = params;

    if (!slug || !rev1 || !rev2) {
      return errorResponse('VALIDATION_ERROR', 'Slug and revision IDs are required', 400);
    }

    const rev1Id = parseInt(rev1, 10);
    const rev2Id = parseInt(rev2, 10);

    if (isNaN(rev1Id) || isNaN(rev2Id)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid revision IDs', 400);
    }

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Fetch revisions
    const revision1 = await getRevisionById(rev1Id);
    const revision2 = await getRevisionById(rev2Id);

    // Verify these revisions belong to this article
    if (revision1.articleId !== article.id || revision2.articleId !== article.id) {
      return errorResponse('NOT_FOUND', 'Revisions not found for this article', 404);
    }

    // Calculate diffs
    const titleDiff = Diff.diffWords(revision1.title, revision2.title);
    const contentDiff = Diff.diffLines(revision1.content, revision2.content);
    const excerptDiff = revision1.excerpt && revision2.excerpt 
      ? Diff.diffWords(revision1.excerpt, revision2.excerpt)
      : null;

    // Calculate stats
    const additions = contentDiff.filter(d => d.added).reduce((acc, d) => acc + (d.count || 0), 0);
    const deletions = contentDiff.filter(d => d.removed).reduce((acc, d) => acc + (d.count || 0), 0);

    // Transform for API
    const compareData = {
      revision1: {
        id: revision1.id,
        title: revision1.title,
        createdAt: revision1.createdAt?.toISOString(),
        editorId: revision1.editorId,
        changeType: revision1.changeType,
      },
      revision2: {
        id: revision2.id,
        title: revision2.title,
        createdAt: revision2.createdAt?.toISOString(),
        editorId: revision2.editorId,
        changeType: revision2.changeType,
      },
      stats: {
        additions,
        deletions,
      },
      diffs: {
        title: titleDiff.map(d => ({
          value: d.value,
          added: d.added || false,
          removed: d.removed || false,
        })),
        content: contentDiff.map(d => ({
          value: d.value,
          added: d.added || false,
          removed: d.removed || false,
          count: d.count,
        })),
        excerpt: excerptDiff ? excerptDiff.map(d => ({
          value: d.value,
          added: d.added || false,
          removed: d.removed || false,
        })) : null,
      },
    };

    return successResponse(compareData);
  } catch (error) {
    console.error('Error comparing revisions:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article or revisions not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to compare revisions',
      500
    );
  }
};

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
