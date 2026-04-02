import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { db, ai_suggestions, ai_usage, eq, and } from '@aidepedia/db';
import { checkGrammarAndStyle } from '../../../../lib/ai-service';

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
    const suggestions = await checkGrammarAndStyle(content, session.user.id);
    const duration = Date.now() - startTime;

    // Save suggestions to database
    if (articleId) {
      await db.delete(ai_suggestions).where(
        and(
          eq(ai_suggestions.articleId, articleId),
          eq(ai_suggestions.suggestionType, 'grammar'),
          eq(ai_suggestions.status, 'pending')
        )
      );

      for (const suggestion of suggestions) {
        await db.insert(ai_suggestions).values({
          articleId,
          userId: session.user.id,
          suggestionType: 'grammar',
          status: 'pending',
          startOffset: suggestion.startOffset,
          endOffset: suggestion.endOffset,
          originalText: suggestion.originalText,
          suggestedText: suggestion.suggestedText,
          confidence: suggestion.confidence,
          reasoning: suggestion.reasoning,
          category: suggestion.category,
        });
      }
    }

    // Log usage
    await db.insert(ai_usage).values({
      userId: session.user.id,
      operation: 'grammar_check',
      articleId,
      tokensUsed: Math.ceil(content.length / 4), // Rough estimate
      costCents: Math.ceil(content.length / 1000), // Rough cost estimate
      success: true,
    });

    return new Response(JSON.stringify({ suggestions }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Grammar check error:', error);
    
    // Log failed usage
    const session = await getSession(request);
    if (session?.user?.id) {
      await db.insert(ai_usage).values({
        userId: session.user.id,
        operation: 'grammar_check',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: 0,
        costCents: 0,
      });
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Grammar check failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
