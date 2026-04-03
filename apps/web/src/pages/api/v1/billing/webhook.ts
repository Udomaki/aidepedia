/**
 * Stripe Webhook Handler
 * OC-124: API Monetization - Handle Stripe webhook events
 */

import type { APIRoute } from 'astro';
import { handleStripeWebhook } from '../../../../lib/stripe-billing';

/**
 * POST /api/v1/billing/webhook - Handle Stripe webhook events
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    
    if (!signature) {
      return new Response(JSON.stringify({ 
        error: 'Missing stripe-signature header' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Verify webhook signature
    // Note: In production, you should verify the signature using Stripe's library
    // const event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    
    // For now, parse the event directly (should be replaced with signature verification)
    const event = JSON.parse(body);
    
    // Handle the webhook event
    await handleStripeWebhook(event);
    
    return new Response(JSON.stringify({ 
      received: true 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error handling Stripe webhook:', error);
    return new Response(JSON.stringify({ 
      error: 'Webhook handler failed',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
