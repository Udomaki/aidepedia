import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { db, ai_suggestions, ai_usage, eq, and } from '@aidepedia/db';
import { suggestCitations } from '../../../../lib/ai-service';

export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { articleId, content } = await request.json();

    if (!content) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const startTime = Date.now();
    const citations = await suggestCitations(content, session.user.id);
    const duration = Date.now() - startTime;

    // Save citation suggestions to database
    if (articleId) {
      await db.delete(ai_suggestions).where(
        and(
          eq(ai_suggestions.articleId, articleId),
          eq(ai_suggestions.suggestionType, 'citation'),
          eq(ai_suggestions.status, 'pending')
        )
      );

      for (const citation of citations) {
        if (citation.needsCitation) {
          await db.insert(ai_suggestions).values({
            articleId,
            userId: session.user.id,
            suggestionType: 'citation',
            status: 'pending',
            originalText: citation.text,
            sources: citation.suggestedSources,
            category: 'needs_citation',
          });
        }
      }
    }

    // Log usage
    await db.insert(ai_usage).values({
      userId: session.user.id,
      operation: 'citation_suggest',
      articleId,
      tokensUsed: Math.ceil(content.length / 4),
      costCents: Math.ceil(content.length / 1000),
      success: true,
    });

    return new Response(JSON.stringify({ citations }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Citation suggestion error:', error);
    
    const session = await getSession(request);
    if (session?.user?.id) {
      await db.insert(ai_usage).values({
        userId: session.user.id,
        operation: 'citation_suggest',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: 0,
        costCents: 0,
      });
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Citation suggestion failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
