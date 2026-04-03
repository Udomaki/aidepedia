import type { APIRoute } from 'astro';
import { db, users, organizations, organizationMembers, ssoAuditLog, eq, and } from '@aidepedia/db';

interface SCIMUser {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'];
  id: string;
  externalId?: string;
  userName: string;
  name?: {
    givenName?: string;
    familyName?: string;
    formatted?: string;
  };
  displayName?: string;
  emails: Array<{
    value: string;
    type?: string;
    primary?: boolean;
  }>;
  active: boolean;
  meta?: {
    resourceType: 'User';
    location?: string;
  };
}

interface SCIMError {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'];
  status: string;
  detail?: string;
}

// Validate SCIM bearer token
async function validateSCIMToken(authHeader: string | null): Promise<typeof organizations.$inferSelect | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  
  const [org] = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.scimEnabled, true),
        eq(organizations.scimBearerToken, token)
      )
    )
    .limit(1);
  
  return org || null;
}

// Convert database user to SCIM format
function userToSCIM(user: typeof users.$inferSelect, member: typeof organizationMembers.$inferSelect): SCIMUser {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: String(user.id),
    externalId: member.scimExternalId || undefined,
    userName: user.email,
    name: {
      givenName: user.name?.split(' ')[0],
      familyName: user.name?.split(' ').slice(1).join(' '),
      formatted: user.name,
    },
    displayName: user.name || undefined,
    emails: [{
      value: user.email,
      type: 'work',
      primary: true,
    }],
    active: true,
    meta: {
      resourceType: 'User',
    },
  };
}

// GET /api/scim/v2/Users/[id] - Get user by ID
export const GET: APIRoute = async ({ request, params }) => {
  const org = await validateSCIMToken(request.headers.get('Authorization'));
  
  if (!org) {
    return new Response(JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Invalid or missing bearer token',
    } as SCIMError), {
      status: 401,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
  
  try {
    const userId = parseInt(params.id!);
    
    const [result] = await db
      .select({
        user: users,
        member: organizationMembers,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(
        and(
          eq(organizationMembers.organizationId, org.id),
          eq(users.id, userId)
        )
      )
      .limit(1);
    
    if (!result) {
      return new Response(JSON.stringify({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      } as SCIMError), {
        status: 404,
        headers: { 'Content-Type': 'application/scim+json' },
      });
    }
    
    return new Response(JSON.stringify(userToSCIM(result.user, result.member)), {
      headers: { 'Content-Type': 'application/scim+json' },
    });
  } catch (error) {
    console.error('SCIM get user error:', error);
    return new Response(JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Internal server error',
    } as SCIMError), {
      status: 500,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
};

// PUT /api/scim/v2/Users/[id] - Update user (full replacement)
export const PUT: APIRoute = async ({ request, params }) => {
  const org = await validateSCIMToken(request.headers.get('Authorization'));
  
  if (!org) {
    return new Response(JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Invalid or missing bearer token',
    } as SCIMError), {
      status: 401,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
  
  try {
    const userId = parseInt(params.id!);
    const scimUser = await request.json() as SCIMUser;
    
    const [result] = await db
      .select({
        user: users,
        member: organizationMembers,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(
        and(
          eq(organizationMembers.organizationId, org.id),
          eq(users.id, userId)
        )
      )
      .limit(1);
    
    if (!result) {
      return new Response(JSON.stringify({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      } as SCIMError), {
        status: 404,
        headers: { 'Content-Type': 'application/scim+json' },
      });
    }
    
    // Update user
    const [updatedUser] = await db
      .update(users)
      .set({
        name: scimUser.displayName || scimUser.name?.formatted,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    
    // Update member external ID if provided
    if (scimUser.externalId) {
      await db
        .update(organizationMembers)
        .set({
          scimExternalId: scimUser.externalId,
          scimSyncedAt: new Date(),
        })
        .where(
          and(
            eq(organizationMembers.organizationId, org.id),
            eq(organizationMembers.userId, userId)
          )
        );
    }
    
    // Get updated member
    const [updatedMember] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, org.id),
          eq(organizationMembers.userId, userId)
        )
      )
      .limit(1);
    
    // Log update event
    await db.insert(ssoAuditLog).values({
      organizationId: org.id,
      userId: updatedUser.id,
      eventType: 'scim_user_updated',
      provider: 'scim',
      success: true,
      eventData: { email: updatedUser.email },
    });
    
    return new Response(JSON.stringify(userToSCIM(updatedUser, updatedMember)), {
      headers: { 'Content-Type': 'application/scim+json' },
    });
  } catch (error) {
    console.error('SCIM update user error:', error);
    
    await db.insert(ssoAuditLog).values({
      organizationId: org.id,
      eventType: 'scim_user_updated',
      provider: 'scim',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Failed to update user',
    } as SCIMError), {
      status: 500,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
};

// PATCH /api/scim/v2/Users/[id] - Partial update
export const PATCH: APIRoute = async ({ request, params }) => {
  // For simplicity, treat PATCH same as PUT
  return PUT({ request, params } as any);
};

// DELETE /api/scim/v2/Users/[id] - Deprovision user
export const DELETE: APIRoute = async ({ request, params }) => {
  const org = await validateSCIMToken(request.headers.get('Authorization'));
  
  if (!org) {
    return new Response(JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Invalid or missing bearer token',
    } as SCIMError), {
      status: 401,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
  
  try {
    const userId = parseInt(params.id!);
    
    const [result] = await db
      .select({
        user: users,
        member: organizationMembers,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(
        and(
          eq(organizationMembers.organizationId, org.id),
          eq(users.id, userId)
        )
      )
      .limit(1);
    
    if (!result) {
      return new Response(JSON.stringify({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      } as SCIMError), {
        status: 404,
        headers: { 'Content-Type': 'application/scim+json' },
      });
    }
    
    // Remove user from organization
    await db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, org.id),
          eq(organizationMembers.userId, userId)
        )
      );
    
    // Log deprovisioning event
    await db.insert(ssoAuditLog).values({
      organizationId: org.id,
      userId: result.user.id,
      eventType: 'scim_user_deprovisioned',
      provider: 'scim',
      success: true,
      eventData: { email: result.user.email },
    });
    
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error('SCIM delete user error:', error);
    
    await db.insert(ssoAuditLog).values({
      organizationId: org.id,
      eventType: 'scim_user_deprovisioned',
      provider: 'scim',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Failed to delete user',
    } as SCIMError), {
      status: 500,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
};
