import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { getRelatedArticles } from '../../../../../lib/recommendations';
import { db, eq } from '@aidepedia/db';
import { articles } from '@aidepedia/db/schema';

export const GET: APIRoute = async ({ params, request, url }) => {
  try {
    const { slug } = params;
    
    if (!slug) {
      return new Response(JSON.stringify({ error: 'Article slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Get article ID from slug
    const articleData = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);
    
    if (articleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const articleId = articleData[0].id;
    
    // Get optional user ID for personalization
    const session = await getSession(request);
    const userId = session?.user?.id ? parseInt(session.user.id) : undefined;
    
    // Get limit from query params
    const limit = parseInt(url.searchParams.get('limit') || '10');
    
    // Get related articles
    const relatedArticles = await getRelatedArticles(articleId, userId, limit);
    
    return new Response(JSON.stringify({
      relatedArticles: relatedArticles.map(r => ({
        article: {
          id: r.article.id,
          slug: r.article.slug,
          title: r.article.title,
          excerpt: r.article.excerpt,
          categoryId: r.article.categoryId,
          viewCount: r.article.viewCount,
          upvotes: r.article.upvotes,
          downvotes: r.article.downvotes,
          readingTime: r.article.readingTime,
          publishedAt: r.article.publishedAt,
        },
        score: r.score,
        reason: r.reason,
        similarity: r.components.contentBased,
      })),
      meta: {
        sourceArticleId: articleId,
        sourceArticleSlug: slug,
        limit,
        total: relatedArticles.length,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching related articles:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch related articles',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
