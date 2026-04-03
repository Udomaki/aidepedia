/**
 * Plugin Reviews API
 * OC-109: Plugin ratings and reviews
 */

import type { APIRoute } from 'astro';
import type { PluginReview } from '../../../../../lib/plugins/types';

// Mock reviews storage
const reviews: PluginReview[] = [
  {
    id: 'review-1',
    pluginId: 'markdown-emoji',
    userId: 'user-1',
    userName: 'John D.',
    rating: 5,
    comment: 'Works perfectly! The auto-complete is super fast.',
    createdAt: new Date('2024-01-15'),
    helpful: 12
  },
  {
    id: 'review-2',
    pluginId: 'markdown-emoji',
    userId: 'user-2',
    userName: 'Sarah K.',
    rating: 4,
    comment: 'Great plugin, would love more emoji packs.',
    createdAt: new Date('2024-01-10'),
    helpful: 8
  },
  {
    id: 'review-3',
    pluginId: 'ai-suggestions',
    userId: 'user-3',
    userName: 'Mike R.',
    rating: 5,
    comment: 'Incredible AI suggestions, saved me hours of editing!',
    createdAt: new Date('2024-01-20'),
    helpful: 24
  }
];

/**
 * GET /api/v1/plugins/[id]/reviews - Get plugin reviews
 */
export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { id } = params;
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const sort = url.searchParams.get('sort') || 'recent';
    
    if (!id) {
      return new Response(JSON.stringify({ error: 'Plugin ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    let pluginReviews = reviews.filter(r => r.pluginId === id);
    
    // Sort reviews
    switch (sort) {
      case 'helpful':
        pluginReviews.sort((a, b) => b.helpful - a.helpful);
        break;
      case 'rating-high':
        pluginReviews.sort((a, b) => b.rating - a.rating);
        break;
      case 'rating-low':
        pluginReviews.sort((a, b) => a.rating - b.rating);
        break;
      case 'recent':
      default:
        pluginReviews.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
    
    // Calculate summary stats
    const stats = {
      total: pluginReviews.length,
      average: pluginReviews.length > 0
        ? pluginReviews.reduce((sum, r) => sum + r.rating, 0) / pluginReviews.length
        : 0,
      distribution: {
        5: pluginReviews.filter(r => r.rating === 5).length,
        4: pluginReviews.filter(r => r.rating === 4).length,
        3: pluginReviews.filter(r => r.rating === 3).length,
        2: pluginReviews.filter(r => r.rating === 2).length,
        1: pluginReviews.filter(r => r.rating === 1).length
      }
    };
    
    return new Response(JSON.stringify({
      reviews: pluginReviews.slice(0, limit),
      stats
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to get reviews',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * POST /api/v1/plugins/[id]/reviews - Submit a review
 */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    const body = await request.json();
    const { userId, userName, rating, comment } = body;
    
    if (!id) {
      return new Response(JSON.stringify({ error: 'Plugin ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Validate input
    if (!userId || !userName || !rating) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: userId, userName, rating' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (rating < 1 || rating > 5) {
      return new Response(JSON.stringify({ 
        error: 'Rating must be between 1 and 5' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if user already reviewed
    const existingReview = reviews.find(
      r => r.pluginId === id && r.userId === userId
    );
    
    if (existingReview) {
      return new Response(JSON.stringify({ 
        error: 'You have already reviewed this plugin' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create review
    const review: PluginReview = {
      id: `review-${Date.now()}`,
      pluginId: id,
      userId,
      userName,
      rating,
      comment: comment || '',
      createdAt: new Date(),
      helpful: 0
    };
    
    reviews.push(review);
    
    return new Response(JSON.stringify(review), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to submit review',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * PATCH /api/v1/plugins/[id]/reviews - Mark review as helpful
 */
export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const body = await request.json();
    const { reviewId, action } = body;
    
    if (!reviewId) {
      return new Response(JSON.stringify({ error: 'Review ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const review = reviews.find(r => r.id === reviewId);
    
    if (!review) {
      return new Response(JSON.stringify({ error: 'Review not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (action === 'helpful') {
      review.helpful++;
    } else if (action === 'unhelpful' && review.helpful > 0) {
      review.helpful--;
    }
    
    return new Response(JSON.stringify(review), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to update review',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
