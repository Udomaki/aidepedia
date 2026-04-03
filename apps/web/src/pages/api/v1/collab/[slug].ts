import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getArticleBySlug } from '@aidepedia/db';
import { errorResponse, handleCors } from '../../../../lib/api-utils';

// Declare Cloudflare bindings
declare const COLLAB_SESSION: DurableObjectNamespace;

/**
 * WebSocket endpoint for real-time collaboration
 * 
 * GET /api/v1/collab/[slug]
 * Upgrades to WebSocket connection for collaborative editing
 */
export const GET: APIRoute = async ({ params, request }) => {
  const { slug } = params;

  if (!slug) {
    return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
  }

  // Check authentication
  const session = await getSession(request);
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }

  // Check if article exists
  try {
    await getArticleBySlug(slug);
  } catch (error) {
    return errorResponse('NOT_FOUND', 'Article not found', 404);
  }

  // For Cloudflare Workers, check if this is a WebSocket upgrade request
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return errorResponse('VALIDATION_ERROR', 'Expected WebSocket upgrade', 426);
  }

  // Route to Durable Object
  const id = COLLAB_SESSION.idFromName(slug);
  const stub = COLLAB_SESSION.get(id);

  // Add user info to URL for the Durable Object
  const url = new URL(request.url);
  url.searchParams.set('userId', session.user.id);
  url.searchParams.set('userName', session.user.name || 'Anonymous');

  // Forward request to Durable Object
  return stub.fetch(url.toString(), request);
};

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
