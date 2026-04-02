import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { db, articles, ai_suggestions, ai_usage, eq, and, desc } from '@aidepedia/db';
import { generateSuggestedEdits } from '../../../../lib/ai-service';

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

    const startTime = Date.now();
    const edits = await generateSuggestedEdits(article, session.user.id);
    const duration = Date.now() - startTime;

    // Clear old suggestions
    await db.delete(ai_suggestions).where(
      and(
        eq(ai_suggestions.articleId, articleId),
        eq(ai_suggestions.status, 'pending')
      )
    );

    // Save new suggestions
    for (const edit of edits) {
      await db.insert(ai_suggestions).values({
        articleId,
        userId: session.user.id,
        suggestionType: edit.type as any,
        status: 'pending',
        originalText: edit.originalText,
        suggestedText: edit.suggestedText,
        reasoning: edit.reasoning,
        category: edit.type,
      });
    }

    // Log usage
    await db.insert(ai_usage).values({
      userId: session.user.id,
      operation: 'suggestion_generate',
      articleId,
      tokensUsed: Math.ceil(article.content.length / 4),
      costCents: Math.ceil(article.content.length / 500),
      success: true,
    });

    return new Response(JSON.stringify({ edits }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Generate suggestions error:', error);
    
    const session = await getSession(request);
    if (session?.user?.id) {
      const body = await request.clone().json().catch(() => ({}));
      await db.insert(ai_usage).values({
        userId: session.user.id,
        operation: 'suggestion_generate',
        articleId: body.articleId,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: 0,
        costCents: 0,
      });
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to generate suggestions',
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
    const status = url.searchParams.get('status') || 'pending';

    if (!articleId) {
      return new Response(JSON.stringify({ error: 'Article ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const suggestions = await db.query.ai_suggestions.findMany({
      where: and(
        eq(ai_suggestions.articleId, articleId),
        eq(ai_suggestions.status, status as any)
      ),
      orderBy: (suggestions, { desc }) => [desc(suggestions.createdAt)],
    });

    return new Response(JSON.stringify({ suggestions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Get suggestions error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to get suggestions',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
