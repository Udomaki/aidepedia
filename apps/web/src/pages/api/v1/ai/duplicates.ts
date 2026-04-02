import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { db, articles, duplicate_articles, ai_usage, eq, ne, and, desc } from '@aidepedia/db';
import { detectDuplicates } from '../../../../lib/ai-service';

export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { articleId } = await request.json();

    if (!articleId) {
      return new Response(JSON.stringify({ error: 'Article ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch article
    const article = await db.query.articles.findFirst({
      where: eq(articles.id, articleId),
    });

    if (!article) {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch other articles for comparison (limit to recent articles to avoid timeout)
    const existingArticles = await db.query.articles.findMany({
      where: and(
        ne(articles.id, articleId),
        eq(articles.status, 'published')
      ),
      limit: 50,
      orderBy: (articles, { desc }) => [desc(articles.updatedAt)],
    });

    const startTime = Date.now();
    const duplicates = await detectDuplicates(
      article,
      existingArticles,
      session.user.id
    );
    const duration = Date.now() - startTime;

    // Save duplicate detection results
    if (duplicates.length > 0) {
      // Clear old duplicate records for this article
      await db.delete(duplicate_articles).where(
        eq(duplicate_articles.articleId, articleId)
      );

      for (const duplicate of duplicates) {
        await db.insert(duplicate_articles).values({
          articleId,
          duplicateOfId: duplicate.articleId,
          similarityScore: duplicate.similarityScore,
          matchingSections: duplicate.matchingSections.map(section => ({
            startOffset: 0,
            endOffset: 0,
            text: section,
          })),
          status: 'detected',
          detectedBy: 'ai',
        });
      }
    }

    // Log usage
    await db.insert(ai_usage).values({
      userId: session.user.id,
      operation: 'duplicate_detect',
      articleId,
      tokensUsed: Math.ceil(article.content.length / 4) * existingArticles.length,
      costCents: Math.ceil(article.content.length / 500) * existingArticles.length,
      success: true,
    });

    return new Response(JSON.stringify({ duplicates }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Duplicate detection error:', error);
    
    const session = await getSession(request);
    if (session?.user?.id) {
      const body = await request.clone().json().catch(() => ({}));
      await db.insert(ai_usage).values({
        userId: session.user.id,
        operation: 'duplicate_detect',
        articleId: body.articleId,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: 0,
        costCents: 0,
      });
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Duplicate detection failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const articleId = parseInt(url.searchParams.get('articleId') || '0');

    if (!articleId) {
      return new Response(JSON.stringify({ error: 'Article ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const duplicates = await db.query.duplicate_articles.findMany({
      where: eq(duplicate_articles.articleId, articleId),
      with: {
        article: true,
        duplicateOf: true,
      },
    });

    return new Response(JSON.stringify({ duplicates }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Get duplicates error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to get duplicates',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
