/**
 * API Key Management API
 * OC-124: API Monetization - Manage individual API keys
 */

import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { db, eq, and } from '@aidepedia/db';
import { api_keys } from '@aidepedia/db/schema';

/**
 * GET /api/v1/api-keys/[id] - Get a specific API key
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
    const keyId = parseInt(params.id);
    
    if (isNaN(keyId)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid API key ID' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const [key] = await db
      .select()
      .from(api_keys)
      .where(and(
        eq(api_keys.id, keyId),
        eq(api_keys.userId, userId)
      ))
      .limit(1);
    
    if (!key) {
      return new Response(JSON.stringify({ 
        error: 'API key not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Mask the actual key for security
    const maskedKey = {
      ...key,
      key: `${key.key.substring(0, 10)}...${key.key.substring(key.key.length - 4)}`
    };
    
    return new Response(JSON.stringify(maskedKey), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching API key:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch API key',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * PUT /api/v1/api-keys/[id] - Update an API key
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
    const keyId = parseInt(params.id);
    
    if (isNaN(keyId)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid API key ID' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json();
    
    const [updatedKey] = await db
      .update(api_keys)
      .set({
        ...body,
        updatedAt: new Date()
      })
      .where(and(
        eq(api_keys.id, keyId),
        eq(api_keys.userId, userId)
      ))
      .returning();
    
    if (!updatedKey) {
      return new Response(JSON.stringify({ 
        error: 'API key not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Mask the actual key for security
    const maskedKey = {
      ...updatedKey,
      key: `${updatedKey.key.substring(0, 10)}...${updatedKey.key.substring(updatedKey.key.length - 4)}`
    };
    
    return new Response(JSON.stringify(maskedKey), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to update API key',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * DELETE /api/v1/api-keys/[id] - Delete an API key
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
    const keyId = parseInt(params.id);
    
    if (isNaN(keyId)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid API key ID' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const [deletedKey] = await db
      .delete(api_keys)
      .where(and(
        eq(api_keys.id, keyId),
        eq(api_keys.userId, userId)
      ))
      .returning();
    
    if (!deletedKey) {
      return new Response(JSON.stringify({ 
        error: 'API key not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      message: 'API key deleted successfully' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to delete API key',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
