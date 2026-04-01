/**
 * API Utilities for AIdepedia Public API (v1)
 * Helper functions for API responses and request handling
 */

import type { APIRoute } from 'astro';
import { 
  getVersionHeaders, 
  extractVersion, 
  logDeprecatedUsage,
  isSunset 
} from './api-version';

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

/**
 * Pagination parameters from query string
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Extract pagination params from URL search params
 */
export function getPaginationParams(url: URL): PaginationParams {
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
  const offset = (page - 1) * limit;
  
  return { page, limit, offset };
}

/**
 * Create a success response
 */
export function successResponse<T>(
  data: T,
  meta?: ApiResponse<T>['meta'],
  status = 200,
  request?: Request
): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
  };
  
  if (meta) {
    response.meta = meta;
  }
  
  // Get version headers
  const version = request ? extractVersion(request, new URL(request.url).pathname) : '1';
  const versionHeaders = getVersionHeaders(version);
  
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Version',
      ...versionHeaders,
    },
  });
}

/**
 * Create an error response
 */
export function errorResponse(
  code: string,
  message: string,
  status = 400,
  request?: Request
): Response {
  const response: ApiResponse<never> = {
    success: false,
    error: {
      code,
      message,
    },
  };
  
  // Get version headers
  const version = request ? extractVersion(request, new URL(request.url).pathname) : '1';
  const versionHeaders = getVersionHeaders(version);
  
  return new Response(JSON.stringify(response), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Version',
      ...versionHeaders,
    },
  });
}

/**
 * Handle CORS preflight requests
 */
export function handleCors(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Version',
    },
  });
}

/**
 * Wrap an API handler with common error handling
 */
export function withErrorHandling(
  handler: APIRoute
): APIRoute {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      console.error('API Error:', error);
      
      if (error instanceof Error) {
        // Handle known error types
        if (error.message.includes('not found')) {
          return errorResponse('NOT_FOUND', error.message, 404);
        }
        if (error.message.includes('Invalid')) {
          return errorResponse('VALIDATION_ERROR', error.message, 400);
        }
      }
      
      return errorResponse(
        'INTERNAL_ERROR',
        'An unexpected error occurred',
        500
      );
    }
  };
}

/**
 * Transform article for public API response
 */
export function transformArticleForApi(article: any, categoryName?: string) {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    content: article.content,
    category: categoryName || null,
    categoryId: article.categoryId,
    tags: article.tags || [],
    status: article.status,
    qualityScore: article.qualityScore || 0,
    viewCount: article.viewCount || 0,
    upvotes: article.upvotes || 0,
    downvotes: article.downvotes || 0,
    readingTime: article.readingTime || 1,
    createdAt: article.createdAt?.toISOString?.() || article.createdAt,
    updatedAt: article.updatedAt?.toISOString?.() || article.updatedAt,
    publishedAt: article.publishedAt?.toISOString?.() || article.publishedAt,
  };
}

/**
 * Transform category for public API response
 */
export function transformCategoryForApi(category: any) {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    description: category.description,
    articleCount: category.articleCount || 0,
  };
}
