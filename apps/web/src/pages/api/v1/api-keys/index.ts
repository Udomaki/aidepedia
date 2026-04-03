/**
 * API Keys Management API
 * OC-124: API Monetization - API key generation and management
 */

import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { db, eq, desc } from '@aidepedia/db';
import { api_keys } from '@aidepedia/db/schema';
import { nanoid } from 'nanoid';

/**
 * Generate a secure API key
 */
function generateApiKey(): string {
  return `ak_${nanoid(32)}`;
}

/**
 * GET /api/v1/api-keys - List user's API keys
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
    
    const keys = await db
      .select()
      .from(api_keys)
      .where(eq(api_keys.userId, userId))
      .orderBy(desc(api_keys.createdAt));
    
    // Mask the actual key for security
    const maskedKeys = keys.map(key => ({
      ...key,
      key: `${key.key.substring(0, 10)}...${key.key.substring(key.key.length - 4)}`
    }));
    
    return new Response(JSON.stringify(maskedKeys), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch API keys',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * POST /api/v1/api-keys - Create a new API key
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
      name,
      description,
      permissions = { read: true, write: false, admin: false },
      rateLimit = 100,
      monthlyQuota = 10000,
      expiresAt
    } = body;
    
    if (!name) {
      return new Response(JSON.stringify({ 
        error: 'Name is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const apiKey = generateApiKey();
    
    const [newKey] = await db
      .insert(api_keys)
      .values({
        userId,
        key: apiKey,
        name,
        description,
        permissions,
        rateLimit,
        monthlyQuota,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true
      })
      .returning();
    
    return new Response(JSON.stringify(newKey), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to create API key',
      message: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
