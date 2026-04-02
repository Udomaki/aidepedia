import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { db, ai_suggestions, ai_usage, eq, and } from '@aidepedia/db';
import { analyzeTone } from '../../../../lib/ai-service';

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
    const toneAnalysis = await analyzeTone(content, session.user.id);
    const duration = Date.now() - startTime;

    // Save tone suggestions to database
    if (articleId && toneAnalysis.suggestions.length > 0) {
      await db.delete(ai_suggestions).where(
        and(
          eq(ai_suggestions.articleId, articleId),
          eq(ai_suggestions.suggestionType, 'tone'),
          eq(ai_suggestions.status, 'pending')
        )
      );

      for (const suggestion of toneAnalysis.suggestions) {
        await db.insert(ai_suggestions).values({
          articleId,
          userId: session.user.id,
          suggestionType: 'tone',
          status: 'pending',
          originalText: suggestion.text,
          reasoning: suggestion.issue,
          suggestedText: suggestion.suggestion,
          category: toneAnalysis.biasType || 'tone',
        });
      }
    }

    // Log usage
    await db.insert(ai_usage).values({
      userId: session.user.id,
      operation: 'tone_analyze',
      articleId,
      tokensUsed: Math.ceil(content.length / 4),
      costCents: Math.ceil(content.length / 1000),
      success: true,
    });

    return new Response(JSON.stringify({ toneAnalysis }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Tone analysis error:', error);
    
    const session = await getSession(request);
    if (session?.user?.id) {
      await db.insert(ai_usage).values({
        userId: session.user.id,
        operation: 'tone_analyze',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: 0,
        costCents: 0,
      });
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Tone analysis failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
