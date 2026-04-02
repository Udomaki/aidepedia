/**
 * API Key Management Endpoints
 * 
 * GET /api/v1/keys - List user's API keys
 * POST /api/v1/keys - Create a new API key
 */

import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import {
  createApiKey,
  getUserApiKeys,
  type ApiKeyType,
} from '../../../../lib/api-keys';

export const GET: APIRoute = async ({ request }) => {
  try {
    // Get session
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Get user's API keys
    const keys = await getUserApiKeys(parseInt(session.user.id));
    
    // Remove sensitive data
    const safeKeys = keys.map(key => ({
      id: key.id,
      name: key.name,
      type: key.type,
      keyPrefix: key.keyPrefix,
      rateLimit: key.rateLimit,
      isActive: key.isActive,
      totalRequests: key.totalRequests,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
      revokedAt: key.revokedAt,
    }));
    
    return new Response(
      JSON.stringify({ keys: safeKeys }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error listing API keys:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    // Get session
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Parse request body
    const body = await request.json();
    
    // Validate input
    if (!body.name || typeof body.name !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate key type
    const validTypes: ApiKeyType[] = ['read-only', 'read-write', 'admin'];
    if (body.type && !validTypes.includes(body.type)) {
      return new Response(
        JSON.stringify({ error: 'Invalid key type. Must be one of: ' + validTypes.join(', ') }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Create API key
    const apiKey = await createApiKey({
      userId: parseInt(session.user.id),
      name: body.name,
      type: body.type || 'read-only',
      rateLimit: body.rateLimit || 1000,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
    
    // Return the key (only time the full key is shown)
    return new Response(
      JSON.stringify({
        key: {
          id: apiKey.id,
          name: apiKey.name,
          type: apiKey.type,
          key: apiKey.key, // Full key - only shown once!
          keyPrefix: apiKey.keyPrefix,
          rateLimit: apiKey.rateLimit,
          isActive: apiKey.isActive,
          createdAt: apiKey.createdAt,
          expiresAt: apiKey.expiresAt,
        },
        message: 'API key created successfully. Save the key now - it will not be shown again!',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating API key:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
