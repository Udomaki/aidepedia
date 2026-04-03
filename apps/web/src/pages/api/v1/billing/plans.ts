/**
 * Billing Plans API
 * OC-124: API Monetization - Get available billing plans
 */

import type { APIRoute } from 'astro';
import { getBillingPlans } from '../../../../lib/stripe-billing';

/**
 * GET /api/v1/billing/plans - Get available billing plans
 */
export const GET: APIRoute = async () => {
  try {
    const plans = await getBillingPlans();
    
    return new Response(JSON.stringify(plans), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching billing plans:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch billing plans',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
