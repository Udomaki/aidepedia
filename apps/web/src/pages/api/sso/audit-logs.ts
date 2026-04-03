import type { APIRoute } from 'astro';
import { db, ssoAuditLog, organizations, users, eq, and, desc, gte, lte } from '@aidepedia/db';
import { getSession } from 'auth-astro/server';

// GET /api/sso/audit-logs - Get SSO audit logs
export const GET: APIRoute = async ({ request, url }) => {
  // Check authentication and admin status
  const session = await getSession(request);
  
  if (!session || (session.user as any)?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  try {
    // Parse query parameters
    const organizationId = url.searchParams.get('organizationId');
    const userId = url.searchParams.get('userId');
    const eventType = url.searchParams.get('eventType');
    const provider = url.searchParams.get('provider');
    const success = url.searchParams.get('success');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    
    // Build query
    let query = db
      .select({
        log: ssoAuditLog,
        organization: organizations,
        user: users,
      })
      .from(ssoAuditLog)
      .leftJoin(organizations, eq(ssoAuditLog.organizationId, organizations.id))
      .leftJoin(users, eq(ssoAuditLog.userId, users.id))
      .$dynamic();
    
    // Apply filters
    const conditions = [];
    
    if (organizationId) {
      conditions.push(eq(ssoAuditLog.organizationId, parseInt(organizationId)));
    }
    
    if (userId) {
      conditions.push(eq(ssoAuditLog.userId, parseInt(userId)));
    }
    
    if (eventType) {
      conditions.push(eq(ssoAuditLog.eventType, eventType as any));
    }
    
    if (provider) {
      conditions.push(eq(ssoAuditLog.provider, provider));
    }
    
    if (success !== null && success !== undefined) {
      conditions.push(eq(ssoAuditLog.success, success === 'true'));
    }
    
    if (startDate) {
      conditions.push(gte(ssoAuditLog.createdAt, new Date(startDate)));
    }
    
    if (endDate) {
      conditions.push(lte(ssoAuditLog.createdAt, new Date(endDate)));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    // Execute query with pagination
    const logs = await query
      .orderBy(desc(ssoAuditLog.createdAt))
      .limit(limit)
      .offset(offset);
    
    // Get total count for pagination
    const countQuery = db
      .select({ count: ssoAuditLog.id })
      .from(ssoAuditLog)
      .$dynamic();
    
    if (conditions.length > 0) {
      (countQuery as any).where(and(...conditions));
    }
    
    const countResult = await countQuery;
    const total = countResult.length;
    
    // Format response
    const formattedLogs = logs.map(({ log, organization, user }) => ({
      id: log.id,
      eventType: log.eventType,
      provider: log.provider,
      success: log.success,
      errorMessage: log.errorMessage,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      eventData: log.eventData,
      createdAt: log.createdAt,
      organization: organization ? {
        id: organization.id,
        name: organization.name,
        domain: organization.domain,
      } : null,
      user: user ? {
        id: user.id,
        email: user.email,
        name: user.name,
      } : null,
    }));
    
    return new Response(JSON.stringify({
      logs: formattedLogs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch audit logs' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// GET /api/sso/audit-logs/stats - Get audit log statistics
export const STATS: APIRoute = async ({ request, url }) => {
  // Check authentication and admin status
  const session = await getSession(request);
  
  if (!session || (session.user as any)?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  try {
    const organizationId = url.searchParams.get('organizationId');
    const startDate = url.searchParams.get('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = url.searchParams.get('endDate') || new Date().toISOString();
    
    // Build base conditions
    const conditions = [
      gte(ssoAuditLog.createdAt, new Date(startDate)),
      lte(ssoAuditLog.createdAt, new Date(endDate)),
    ];
    
    if (organizationId) {
      conditions.push(eq(ssoAuditLog.organizationId, parseInt(organizationId)));
    }
    
    const whereClause = and(...conditions);
    
    // Get event counts by type
    const eventCounts = await db
      .select()
      .from(ssoAuditLog)
      .where(whereClause);
    
    // Aggregate statistics
    const stats = {
      totalEvents: eventCounts.length,
      successfulLogins: eventCounts.filter(e => e.eventType === 'sso_login_success').length,
      failedLogins: eventCounts.filter(e => e.eventType === 'sso_login_failed').length,
      usersProvisioned: eventCounts.filter(e => e.eventType === 'scim_user_provisioned').length,
      usersDeprovisioned: eventCounts.filter(e => e.eventType === 'scim_user_deprovisioned').length,
      samlEvents: eventCounts.filter(e => e.provider === 'saml').length,
      oidcEvents: eventCounts.filter(e => e.provider === 'oidc').length,
      scimEvents: eventCounts.filter(e => e.provider === 'scim').length,
      eventsByType: {} as Record<string, number>,
      eventsByProvider: {
        saml: 0,
        oidc: 0,
        scim: 0,
      },
    };
    
    // Count events by type
    eventCounts.forEach(event => {
      stats.eventsByType[event.eventType] = (stats.eventsByType[event.eventType] || 0) + 1;
      
      if (event.provider) {
        stats.eventsByProvider[event.provider as keyof typeof stats.eventsByProvider]++;
      }
    });
    
    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch audit stats:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch audit stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
