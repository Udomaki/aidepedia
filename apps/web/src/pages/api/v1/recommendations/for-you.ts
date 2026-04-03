import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { getPersonalizedRecommendations, getColdStartRecommendations } from '../../../../lib/recommendations';
import { db, eq, count } from '@aidepedia/db';
import { recommendation_interactions } from '@aidepedia/db/schema';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const userId = parseInt(session.user.id);
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    // Get recommendations
    // If user has no reading history, use cold start recommendations
    let recommendations;
    
    // Check if user has any interactions
    const interactionCount = await db
      .select({ count: count() })
      .from(recommendation_interactions)
      .where(eq(recommendation_interactions.userId, userId));
    
    const hasHistory = interactionCount[0]?.count > 0;
    
    if (hasHistory) {
      recommendations = await getPersonalizedRecommendations(userId, limit, offset);
    } else {
      recommendations = await getColdStartRecommendations(limit);
    }
    
    return new Response(JSON.stringify({
      recommendations: recommendations.map(r => ({
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
        components: r.components,
      })),
      meta: {
        limit,
        offset,
        total: recommendations.length,
        personalized: hasHistory,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch recommendations',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
