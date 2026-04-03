import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { getTrendingArticles, getPersonalizedTrending, getSimpleTrending } from '../../../../lib/trending';

export const GET: APIRoute = async ({ request, url }) => {
  try {
    // Get query parameters
    const window = (url.searchParams.get('window') || '24h') as '24h' | '7d' | '30d';
    const categoryId = url.searchParams.get('categoryId') 
      ? parseInt(url.searchParams.get('categoryId')!) 
      : undefined;
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const personalized = url.searchParams.get('personalized') === 'true';
    
    let trendingArticles;
    
    // Check if user wants personalized trending
    if (personalized) {
      const session = await getSession(request);
      
      if (!session?.user?.id) {
        return new Response(JSON.stringify({ error: 'Unauthorized for personalized trending' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      
      const userId = parseInt(session.user.id);
      trendingArticles = await getPersonalizedTrending(userId, window, limit);
    } else {
      // Try to get pre-computed trending scores
      try {
        trendingArticles = await getTrendingArticles(window, categoryId, limit, offset);
        
        // If no results, fall back to simple trending
        if (trendingArticles.length === 0) {
          trendingArticles = await getSimpleTrending(window, limit);
        }
      } catch (error) {
        // Fall back to simple trending if there's an error
        console.warn('Falling back to simple trending:', error);
        trendingArticles = await getSimpleTrending(window, limit);
      }
    }
    
    return new Response(JSON.stringify({
      trending: trendingArticles.map(t => ({
        article: {
          id: t.article.id,
          slug: t.article.slug,
          title: t.article.title,
          excerpt: t.article.excerpt,
          categoryId: t.article.categoryId,
          viewCount: t.article.viewCount,
          upvotes: t.article.upvotes,
          downvotes: t.article.downvotes,
          readingTime: t.article.readingTime,
          publishedAt: t.article.publishedAt,
        },
        trendingScore: t.trendingScore,
        viewVelocity: t.viewVelocity,
        upvoteVelocity: t.upvoteVelocity,
        commentVelocity: t.commentVelocity,
        rank: t.rank,
      })),
      meta: {
        window,
        categoryId,
        limit,
        offset,
        total: trendingArticles.length,
        personalized,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching trending articles:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch trending articles',
      message: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
