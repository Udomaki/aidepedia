/**
 * API Endpoint: Submit Review (Approve/Reject/Request Changes)
 * POST /api/v1/articles/:slug/review
 */

import type { APIRoute } from 'astro';
import { getSession } from '../../../../../lib/auth';
import { db, eq, and } from '@aidepedia/db';
import { articles, article_reviews } from '@aidepedia/db/schema';

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

    const reviewerId = parseInt(session.user.id as string, 10);
    const { slug } = params;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { action, comments, checklist } = body as {
      action: 'approve' | 'reject' | 'request_changes';
      comments?: string;
      checklist?: {
        accurate: boolean;
        wellWritten: boolean;
        properlySourced: boolean;
        neutralPOV: boolean;
        comprehensive: boolean;
      };
    };

    if (!action || !['approve', 'reject', 'request_changes'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action. Must be approve, reject, or request_changes' }), {
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

    // Check if article is pending review
    if (article.status !== 'pending_review') {
      return new Response(JSON.stringify({ error: 'Article is not pending review' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get pending review
    const [review] = await db.select()
      .from(article_reviews)
      .where(and(
        eq(article_reviews.articleId, article.id),
        eq(article_reviews.status, 'pending')
      ))
      .limit(1);

    if (!review) {
      return new Response(JSON.stringify({ error: 'No pending review found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Determine new status
    let reviewStatus: 'approved' | 'rejected' | 'changes_requested';
    let articleStatus: 'published' | 'rejected' | 'draft';

    if (action === 'approve') {
      reviewStatus = 'approved';
      articleStatus = 'published';
    } else if (action === 'reject') {
      reviewStatus = 'rejected';
      articleStatus = 'rejected';
    } else {
      reviewStatus = 'changes_requested';
      articleStatus = 'draft';
    }

    // Update review
    const [updatedReview] = await db.update(article_reviews)
      .set({
        reviewerId,
        status: reviewStatus,
        comments,
        checklist,
        reviewedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(article_reviews.id, review.id))
      .returning();

    // Update article status
    const updateData: any = {
      status: articleStatus,
      updatedAt: new Date()
    };

    if (articleStatus === 'published') {
      updateData.publishedAt = new Date();
    }

    const [updatedArticle] = await db.update(articles)
      .set(updateData)
      .where(eq(articles.id, article.id))
      .returning();

    return new Response(JSON.stringify({
      success: true,
      data: {
        article: updatedArticle,
        review: updatedReview
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Review error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to submit review',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
