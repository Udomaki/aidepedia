import type { APIRoute } from 'astro';
import { 
  getArticleBySlug,
  getVersionAuditLog
} from '@aidepedia/db';
import { 
  successResponse, 
  errorResponse, 
  handleCors
} from '../../../../../lib/api-utils';

/**
 * GET /api/v1/articles/[slug]/audit
 * Get version control audit log for an article
 * 
 * Query params:
 * - limit: number (default: 50, max: 200)
 */
export const GET: APIRoute = async ({ params, url }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return errorResponse('VALIDATION_ERROR', 'Slug is required', 400);
    }

    // Get pagination params
    const limit = Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10));

    // Fetch article
    const article = await getArticleBySlug(slug);

    // Fetch audit log
    const auditLog = await getVersionAuditLog(article.id);

    // Transform for API
    const auditData = auditLog.slice(0, limit).map(entry => ({
      id: entry.id,
      action: entry.action,
      performedBy: entry.performedBy,
      branchId: entry.branchId,
      revisionId: entry.revisionId,
      mergeId: entry.mergeId,
      details: entry.details,
      createdAt: entry.createdAt?.toISOString(),
    }));

    return successResponse({
      auditLog: auditData,
      total: auditLog.length,
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    
    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      return errorResponse('NOT_FOUND', 'Article not found', 404);
    }
    
    return errorResponse(
      'INTERNAL_ERROR',
      'Failed to fetch audit log',
      500
    );
  }
};

/**
 * Handle OPTIONS for CORS preflight
 */
export const OPTIONS: APIRoute = async () => {
  return handleCors();
};
