/**
 * Webhook Endpoints Management API
 * OC-124: API Monetization - Webhook marketplace
 */

import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { db, eq, desc } from '@aidepedia/db';
import { webhook_endpoints } from '@aidepedia/db/schema';
import { nanoid } from 'nanoid';

/**
 * Generate a webhook secret
 */
function generateWebhookSecret(): string {
  return `whsec_${nanoid(32)}`;
}

/**
 * GET /api/v1/webhooks - List user's webhook endpoints
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
    
    const endpoints = await db
      .select()
      .from(webhook_endpoints)
      .where(eq(webhook_endpoints.userId, userId))
      .orderBy(desc(webhook_endpoints.createdAt));
    
    return new Response(JSON.stringify(endpoints), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching webhook endpoints:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch webhook endpoints',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * POST /api/v1/webhooks - Create a new webhook endpoint
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
    
    const {
      url,
      description,
      events
    } = body;
    
    if (!url || !events || !Array.isArray(events) || events.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'URL and events array are required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Validate URL
    try {
      new URL(url);
    } catch {
      return new Response(JSON.stringify({ 
        error: 'Invalid URL' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const secret = generateWebhookSecret();
    
    const [endpoint] = await db
      .insert(webhook_endpoints)
      .values({
        userId,
        url,
        secret,
        description,
        events,
        isActive: true
      })
      .returning();
    
    return new Response(JSON.stringify(endpoint), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating webhook endpoint:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to create webhook endpoint',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
