/**
 * Webhook Endpoint Management API
 * OC-124: API Monetization - Manage individual webhook endpoints
 */

import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { db, eq, and } from '@aidepedia/db';
import { webhook_endpoints } from '@aidepedia/db/schema';

/**
 * GET /api/v1/webhooks/[id] - Get a specific webhook endpoint
 */
export const GET: APIRoute = async ({ params, request }) => {
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
    const webhookId = parseInt(params.id);
    
    if (isNaN(webhookId)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid webhook ID' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const [webhook] = await db
      .select()
      .from(webhook_endpoints)
      .where(and(
        eq(webhook_endpoints.id, webhookId),
        eq(webhook_endpoints.userId, userId)
      ))
      .limit(1);
    
    if (!webhook) {
      return new Response(JSON.stringify({ 
        error: 'Webhook not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(webhook), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching webhook:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch webhook',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * PUT /api/v1/webhooks/[id] - Update a webhook endpoint
 */
export const PUT: APIRoute = async ({ params, request }) => {
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
    const webhookId = parseInt(params.id);
    
    if (isNaN(webhookId)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid webhook ID' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json();
    
    const [updatedWebhook] = await db
      .update(webhook_endpoints)
      .set({
        ...body,
        updatedAt: new Date()
      })
      .where(and(
        eq(webhook_endpoints.id, webhookId),
        eq(webhook_endpoints.userId, userId)
      ))
      .returning();
    
    if (!updatedWebhook) {
      return new Response(JSON.stringify({ 
        error: 'Webhook not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(updatedWebhook), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating webhook:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to update webhook',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * DELETE /api/v1/webhooks/[id] - Delete a webhook endpoint
 */
export const DELETE: APIRoute = async ({ params, request }) => {
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
    const webhookId = parseInt(params.id);
    
    if (isNaN(webhookId)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid webhook ID' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const [deletedWebhook] = await db
      .delete(webhook_endpoints)
      .where(and(
        eq(webhook_endpoints.id, webhookId),
        eq(webhook_endpoints.userId, userId)
      ))
      .returning();
    
    if (!deletedWebhook) {
      return new Response(JSON.stringify({ 
        error: 'Webhook not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Webhook deleted successfully' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting webhook:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to delete webhook',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
