import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { db, articles, ai_quality_scores, ai_usage, eq } from '@aidepedia/db';
import { calculateQualityScore } from '../../../../lib/ai-service';

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
    const qualityScore = await calculateQualityScore(article, session.user.id);
    const duration = Date.now() - startTime;

    // Calculate metrics
    const wordCount = article.content.split(/\s+/).length;
    const citationCount = (article.content.match(/\[\d+\]/g) || []).length;
    const headingCount = (article.content.match(/^#+\s/gm) || []).length;
    const paragraphCount = article.content.split(/\n\n+/).length;

    // Save or update quality score
    const existingScore = await db.query.ai_quality_scores.findFirst({
      where: eq(ai_quality_scores.articleId, articleId),
    });

    if (existingScore) {
      await db
        .update(ai_quality_scores)
        .set({
          overallScore: qualityScore.overallScore,
          completenessScore: qualityScore.completenessScore,
          accuracyScore: qualityScore.accuracyScore,
          readabilityScore: qualityScore.readabilityScore,
          citationScore: qualityScore.citationScore,
          toneScore: qualityScore.toneScore,
          wordCount,
          citationCount,
          headingCount,
          paragraphCount,
          improvements: qualityScore.improvements,
          updatedAt: new Date(),
        })
        .where(eq(ai_quality_scores.articleId, articleId));
    } else {
      await db.insert(ai_quality_scores).values({
        articleId,
        overallScore: qualityScore.overallScore,
        completenessScore: qualityScore.completenessScore,
        accuracyScore: qualityScore.accuracyScore,
        readabilityScore: qualityScore.readabilityScore,
        citationScore: qualityScore.citationScore,
        toneScore: qualityScore.toneScore,
        wordCount,
        citationCount,
        headingCount,
        paragraphCount,
        improvements: qualityScore.improvements,
      });
    }

    // Update article quality score
    await db
      .update(articles)
      .set({ qualityScore: qualityScore.overallScore })
      .where(eq(articles.id, articleId));

    // Log usage
    await db.insert(ai_usage).values({
      userId: session.user.id,
      operation: 'quality_score',
      articleId,
      tokensUsed: Math.ceil(article.content.length / 4),
      costCents: Math.ceil(article.content.length / 500),
      success: true,
    });

    return new Response(JSON.stringify({ qualityScore }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Quality score error:', error);
    
    const session = await getSession(request);
    if (session?.user?.id) {
      const body = await request.clone().json().catch(() => ({}));
      await db.insert(ai_usage).values({
        userId: session.user.id,
        operation: 'quality_score',
        articleId: body.articleId,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        tokensUsed: 0,
        costCents: 0,
      });
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Quality scoring failed',
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

    const qualityScore = await db.query.ai_quality_scores.findFirst({
      where: eq(ai_quality_scores.articleId, articleId),
    });

    if (!qualityScore) {
      return new Response(JSON.stringify({ error: 'Quality score not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ qualityScore }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Get quality score error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to get quality score',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
