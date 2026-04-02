/**
 * OpenAPI Specification Endpoint
 * 
 * GET /api/v1/docs/openapi.json - Get OpenAPI specification
 */

import type { APIRoute } from 'astro';
import { openApiSpec } from '../../../../lib/openapi';

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(openApiSpec, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
