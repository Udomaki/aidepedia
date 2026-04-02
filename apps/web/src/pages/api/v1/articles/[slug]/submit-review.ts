/**
 * API Endpoint: Submit Article for Review
 * POST /api/v1/articles/:slug/submit-review
 */

import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { db, eq, and } from '@aidepedia/db';
import { articles, article_reviews, article_quality_scores } from '@aidepedia/db/schema';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = parseInt(session.user.id as string, 10);
    const { slug } = params;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get article
    const [article] = await db.select()
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);

    if (!article) {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user is the author
    if (article.authorId !== userId) {
      return new Response(JSON.stringify({ error: 'Only the author can submit for review' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if article is in draft status
    if (article.status !== 'draft') {
      return new Response(JSON.stringify({ error: 'Article must be in draft status to submit for review' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if there's already a pending review
    const [existingReview] = await db.select()
      .from(article_reviews)
      .where(and(
        eq(article_reviews.articleId, article.id),
        eq(article_reviews.status, 'pending')
      ))
      .limit(1);

    if (existingReview) {
      return new Response(JSON.stringify({ error: 'Article already has a pending review' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get quality score (if exists)
    const [qualityScore] = await db.select()
      .from(article_quality_scores)
      .where(eq(article_quality_scores.articleId, article.id))
      .orderBy(article_quality_scores.createdAt)
      .limit(1);

    // Optional: Require minimum quality score
    if (qualityScore && qualityScore.overallScore < 50) {
      return new Response(JSON.stringify({
        error: 'Article quality score is too low for review',
        qualityScore: qualityScore.overallScore
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update article status to pending_review
    await db.update(articles)
      .set({ status: 'pending_review', updatedAt: new Date() })
      .where(eq(articles.id, article.id));

    // Create review record
    const [review] = await db.insert(article_reviews).values({
      articleId: article.id,
      reviewerId: userId, // Will be reassigned to actual reviewer
      status: 'pending'
    }).returning();

    return new Response(JSON.stringify({
      success: true,
      data: {
        article: { ...article, status: 'pending_review' },
        review
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Submit review error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to submit article for review',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
