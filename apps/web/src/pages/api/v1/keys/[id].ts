/**
 * Individual API Key Management Endpoints
 * 
 * GET /api/v1/keys/[id] - Get a specific API key
 * PATCH /api/v1/keys/[id] - Update an API key
 * DELETE /api/v1/keys/[id] - Revoke an API key
 */

import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import {
  getApiKeyById,
  updateApiKey,
  revokeApiKey,
  getApiKeyUsageStats,
} from '../../../../lib/api-keys';

export const GET: APIRoute = async ({ params, request }) => {
  try {
    // Get session
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const keyId = parseInt(params.id!);
    if (isNaN(keyId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid key ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Get API key
    const key = await getApiKeyById(keyId, parseInt(session.user.id));
    if (!key) {
      return new Response(
        JSON.stringify({ error: 'API key not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Get usage stats (last 30 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const usageStats = await getApiKeyUsageStats(key.id, startDate, endDate);
    
    // Return key with usage stats
    return new Response(
      JSON.stringify({
        key: {
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
        },
        usage: usageStats,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error getting API key:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    // Get session
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const keyId = parseInt(params.id!);
    if (isNaN(keyId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid key ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Parse request body
    const body = await request.json();
    
    // Build updates object
    const updates: any = {};
    
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return new Response(
          JSON.stringify({ error: 'Name must be a non-empty string' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      updates.name = body.name.trim();
    }
    
    if (body.type !== undefined) {
      const validTypes = ['read-only', 'read-write', 'admin'];
      if (!validTypes.includes(body.type)) {
        return new Response(
          JSON.stringify({ error: 'Invalid key type. Must be one of: ' + validTypes.join(', ') }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      updates.type = body.type;
    }
    
    if (body.rateLimit !== undefined) {
      if (typeof body.rateLimit !== 'number' || body.rateLimit < 1) {
        return new Response(
          JSON.stringify({ error: 'Rate limit must be a positive number' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      updates.rateLimit = body.rateLimit;
    }
    
    // Update API key
    const key = await updateApiKey(keyId, parseInt(session.user.id), updates);
    if (!key) {
      return new Response(
        JSON.stringify({ error: 'API key not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({
        key: {
          id: key.id,
          name: key.name,
          type: key.type,
          keyPrefix: key.keyPrefix,
          rateLimit: key.rateLimit,
          isActive: key.isActive,
          updatedAt: key.updatedAt,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error updating API key:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const DELETE: APIRoute = async ({ params, request }) => {
  try {
    // Get session
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const keyId = parseInt(params.id!);
    if (isNaN(keyId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid key ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Revoke API key
    const success = await revokeApiKey(keyId, parseInt(session.user.id));
    if (!success) {
      return new Response(
        JSON.stringify({ error: 'API key not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ message: 'API key revoked successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error revoking API key:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
