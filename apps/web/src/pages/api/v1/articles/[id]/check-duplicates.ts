import type { APIRoute } from 'astro';
import { db, eq, and, ne, desc } from '@aidepedia/db';
import { articles, duplicate_detection } from '@aidepedia/db/schema';
import {
  successResponse,
  errorResponse,
  handleCors,
} from '../../../../../lib/api-utils';
import { getSession } from '../../../../../lib/auth';
import {
  generateMinHashSignature,
  generateSimHash,
  generateContentHash,
  calculateSimilarity,
  findMatchingSections,
  determineMatchType,
} from '../../../../../lib/duplicate-detection';

/**
 * POST /api/v1/articles/[id]/check-duplicates
 * Check for duplicate/similar articles
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const articleId = parseInt(params.id as string, 10);

    if (isNaN(articleId)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid article ID', 400);
    }

    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    // Get the article to check
    const [article] = await db
      .select()
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }

    // Generate fingerprints for the article
    const minHashSig = generateMinHashSignature(article.content);
    const simHash = generateSimHash(article.content);
    const contentHash = generateContentHash(article.content);

    // Get all other published articles to compare against
    const otherArticles = await db
      .select()
      .from(articles)
      .where(
        and(
          ne(articles.id, articleId),
          eq(articles.status, 'published')
        )
      );

    // Compare with each article
    const duplicates: Array<{
      articleId: number;
      articleTitle: string;
      articleSlug: string;
      similarity: ReturnType<typeof calculateSimilarity>;
      matchType: string;
      matchingSections: Array<{ start: number; end: number; text: string }>;
    }> = [];

    for (const other of otherArticles) {
      // Quick check using content hash for exact duplicates
      const otherContentHash = generateContentHash(other.content);
      
      if (otherContentHash === contentHash) {
        // Exact duplicate found
        duplicates.push({
          articleId: other.id,
          articleTitle: other.title,
          articleSlug: other.slug,
          similarity: { overall: 100, minHashSimilarity: 100, simHashSimilarity: 100, levenshteinSimilarity: 100 },
          matchType: 'exact',
          matchingSections: [{ start: 0, end: article.content.length, text: article.content.substring(0, 200) + '...' }]
        });
        continue;
      }

      // Calculate similarity scores
      const similarity = calculateSimilarity(
        article.content,
        other.content,
        minHashSig,
        undefined,
        simHash,
        undefined
      );

      // Only include if similarity is above threshold (50%)
      if (similarity.overall >= 50) {
        const matchType = determineMatchType(similarity.overall);
        const matchingSections = findMatchingSections(article.content, other.content);

        duplicates.push({
          articleId: other.id,
          articleTitle: other.title,
          articleSlug: other.slug,
          similarity,
          matchType,
          matchingSections
        });

        // Store in database if significant match
        if (similarity.overall >= 70) {
          await db.insert(duplicate_detection).values({
            articleId: article.id,
            duplicateArticleId: other.id,
            similarityScore: similarity.overall.toString(),
            contentHash,
            minhashSignature: JSON.stringify(minHashSig),
            matchType,
            matchingSections: matchingSections.length > 0 ? matchingSections : null,
            status: 'pending',
          }).onConflictDoNothing();
        }
      }
    }

    // Sort by similarity score (highest first)
    duplicates.sort((a, b) => b.similarity.overall - a.similarity.overall);

    return successResponse({
      articleId: article.id,
      articleTitle: article.title,
      contentHash,
      duplicateCount: duplicates.length,
      duplicates: duplicates.slice(0, 10), // Return top 10 matches
      summary: {
        exact: duplicates.filter(d => d.matchType === 'exact').length,
        nearDuplicate: duplicates.filter(d => d.matchType === 'near_duplicate').length,
        similar: duplicates.filter(d => d.matchType === 'similar').length,
      }
    });
  } catch (error) {
    console.error('Error checking duplicates:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to check for duplicates',
      500
    );
  }
};

/**
 * OPTIONS /api/v1/articles/[id]/check-duplicates
 * Handle CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
