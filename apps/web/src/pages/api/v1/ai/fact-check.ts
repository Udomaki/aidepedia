import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { db, ai_suggestions, ai_usage, eq, and } from '@aidepedia/db';
import { verifyFacts } from '../../../../lib/ai-service';

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
    const claims = await verifyFacts(content, session.user.id);
    const duration = Date.now() - startTime;

    // Save fact checks to database
    if (articleId) {
      await db.delete(ai_suggestions).where(
        and(
          eq(ai_suggestions.articleId, articleId),
          eq(ai_suggestions.suggestionType, 'fact_check'),
          eq(ai_suggestions.status, 'pending')
        )
      );

      for (const claim of claims) {
        await db.insert(ai_suggestions).values({
          articleId,
          userId: session.user.id,
          suggestionType: 'fact_check',
          status: 'pending',
          originalText: claim.claim,
          verificationStatus: claim.status,
          confidence: claim.confidence,
          sources: claim.sources,
          category: 'fact_verification',
        });
      }
    }

    // Log usage
    await db.insert(ai_usage).values({
      userId: session.user.id,
      operation: 'fact_verify',
      articleId,
      tokensUsed: Math.ceil(content.length / 4),
      costCents: Math.ceil(content.length / 1000),
      success: true,
    });

    return new Response(JSON.stringify({ claims }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Fact check error:', error);
    
    const session = await getSession(request);
    if (session?.user?.id) {
      await db.insert(ai_usage).values({
        userId: session.user.id,
        operation: 'fact_verify',
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: 0,
        costCents: 0,
      });
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Fact check failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
