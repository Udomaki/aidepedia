import type { APIRoute } from 'astro';
import { db, users, organizations, organizationMembers, scimGroups, scimGroupMembers, ssoAuditLog, eq, and, like } from '@aidepedia/db';
import { nanoid } from 'nanoid';

// SCIM 2.0 User endpoints

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
  groups?: Array<{
    value: string;
    display: string;
    type?: string;
  }>;
  meta?: {
    resourceType: 'User';
    location?: string;
  };
}

interface SCIMListResponse {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: SCIMUser[];
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

// GET /api/scim/v2/Users - List users
export const GET: APIRoute = async ({ request, url }) => {
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
    const startIndex = parseInt(url.searchParams.get('startIndex') || '1');
    const count = parseInt(url.searchParams.get('count') || '100');
    const filter = url.searchParams.get('filter');
    
    // Get organization members with user data
    const members = await db
      .select({
        user: users,
        member: organizationMembers,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, org.id))
      .limit(count)
      .offset(startIndex - 1);
    
    // Apply filter if provided
    let filteredMembers = members;
    if (filter && filter.includes('userName')) {
      const emailMatch = filter.match(/userName eq "(.+?)"/);
      if (emailMatch) {
        const email = emailMatch[1];
        filteredMembers = members.filter(m => m.user.email === email);
      }
    }
    
    const scimUsers = filteredMembers.map(({ user, member }) => userToSCIM(user, member));
    
    const response: SCIMListResponse = {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: scimUsers.length,
      startIndex,
      itemsPerPage: count,
      Resources: scimUsers,
    };
    
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/scim+json' },
    });
  } catch (error) {
    console.error('SCIM list users error:', error);
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

// POST /api/scim/v2/Users - Create user
export const POST: APIRoute = async ({ request }) => {
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
    const scimUser = await request.json() as SCIMUser;
    
    // Check if user already exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, scimUser.userName))
      .limit(1);
    
    let user;
    
    if (existingUser) {
      // User exists, add to organization if not already a member
      user = existingUser;
      
      const [existingMember] = await db
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, org.id),
            eq(organizationMembers.userId, user.id)
          )
        )
        .limit(1);
      
      if (!existingMember) {
        await db.insert(organizationMembers).values({
          organizationId: org.id,
          userId: user.id,
          role: 'member',
          scimExternalId: scimUser.externalId,
          scimSyncedAt: new Date(),
        });
      }
    } else {
      // Create new user
      const [newUser] = await db.insert(users).values({
        email: scimUser.userName,
        name: scimUser.displayName || scimUser.name?.formatted,
        emailVerified: new Date(), // Trust IdP email verification
      }).returning();
      
      user = newUser;
      
      // Add to organization
      await db.insert(organizationMembers).values({
        organizationId: org.id,
        userId: user.id,
        role: 'member',
        scimExternalId: scimUser.externalId,
        scimSyncedAt: new Date(),
      });
    }
    
    // Get member record
    const [member] = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, org.id),
          eq(organizationMembers.userId, user.id)
        )
      )
      .limit(1);
    
    // Log provisioning event
    await db.insert(ssoAuditLog).values({
      organizationId: org.id,
      userId: user.id,
      eventType: 'scim_user_provisioned',
      provider: 'scim',
      success: true,
      eventData: { email: user.email, externalId: scimUser.externalId },
    });
    
    return new Response(JSON.stringify(userToSCIM(user, member)), {
      status: 201,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  } catch (error) {
    console.error('SCIM create user error:', error);
    
    await db.insert(ssoAuditLog).values({
      organizationId: org.id,
      eventType: 'scim_user_provisioned',
      provider: 'scim',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Failed to create user',
    } as SCIMError), {
      status: 500,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
};
