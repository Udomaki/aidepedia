/**
 * Billing Subscription API
 * OC-124: API Monetization - Create and manage subscriptions
 */

import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { createSubscription, cancelSubscription } from '../../../../lib/stripe-billing';
import { db, eq } from '@aidepedia/db';
import { subscriptions, billing_plans } from '@aidepedia/db/schema';

/**
 * GET /api/v1/billing/subscribe - Get user's current subscription
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ 
        error: 'Unauthorized' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const userId = parseInt(session.user.id);
    
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    
    if (!subscription) {
      return new Response(JSON.stringify({ 
        subscription: null 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get plan details
    const [plan] = await db
      .select()
      .from(billing_plans)
      .where(eq(billing_plans.id, subscription.planId))
      .limit(1);
    
    return new Response(JSON.stringify({ 
      subscription: {
        ...subscription,
        plan
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch subscription',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * POST /api/v1/billing/subscribe - Create a new subscription
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ 
        error: 'Unauthorized' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const userId = parseInt(session.user.id);
    const body = await request.json();
    
    const { planId, interval = 'monthly' } = body;
    
    if (!planId) {
      return new Response(JSON.stringify({ 
        error: 'Plan ID is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const result = await createSubscription({
      userId,
      planId,
      interval,
      email: session.user.email || '',
      name: session.user.name || undefined
    });
    
    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to create subscription',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * DELETE /api/v1/billing/subscribe - Cancel subscription
 */
export const DELETE: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ 
        error: 'Unauthorized' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const userId = parseInt(session.user.id);
    
    // Get user's subscription
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    
    if (!subscription) {
      return new Response(JSON.stringify({ 
        error: 'No active subscription found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    await cancelSubscription(subscription.id);
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Subscription canceled successfully' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error canceling subscription:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to cancel subscription',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
