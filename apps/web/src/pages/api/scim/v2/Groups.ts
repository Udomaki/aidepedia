import type { APIRoute } from 'astro';
import { db, organizations, scimGroups, scimGroupMembers, users, organizationMembers, ssoAuditLog, eq, and } from '@aidepedia/db';

interface SCIMGroup {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'];
  id: string;
  externalId?: string;
  displayName: string;
  members?: Array<{
    value: string;
    display?: string;
    type?: string;
  }>;
  meta?: {
    resourceType: 'Group';
    location?: string;
  };
}

interface SCIMListResponse {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: SCIMGroup[];
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

// Convert database group to SCIM format
async function groupToSCIM(group: typeof scimGroups.$inferSelect): Promise<SCIMGroup> {
  // Get group members
  const members = await db
    .select({
      user: users,
    })
    .from(scimGroupMembers)
    .innerJoin(users, eq(scimGroupMembers.userId, users.id))
    .where(eq(scimGroupMembers.groupId, group.id));
  
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
    id: String(group.id),
    externalId: group.externalId,
    displayName: group.displayName,
    members: members.map(({ user }) => ({
      value: String(user.id),
      display: user.name || user.email,
      type: 'User',
    })),
    meta: {
      resourceType: 'Group',
    },
  };
}

// GET /api/scim/v2/Groups - List groups
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
    
    const groups = await db
      .select()
      .from(scimGroups)
      .where(eq(scimGroups.organizationId, org.id))
      .limit(count)
      .offset(startIndex - 1);
    
    const scimGroupsList = await Promise.all(
      groups.map(group => groupToSCIM(group))
    );
    
    const response: SCIMListResponse = {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: scimGroupsList.length,
      startIndex,
      itemsPerPage: count,
      Resources: scimGroupsList,
    };
    
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/scim+json' },
    });
  } catch (error) {
    console.error('SCIM list groups error:', error);
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

// POST /api/scim/v2/Groups - Create group
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
    const scimGroup = await request.json() as SCIMGroup;
    
    // Check if group already exists
    const [existingGroup] = await db
      .select()
      .from(scimGroups)
      .where(
        and(
          eq(scimGroups.organizationId, org.id),
          eq(scimGroups.externalId, scimGroup.externalId || scimGroup.displayName)
        )
      )
      .limit(1);
    
    let group;
    
    if (existingGroup) {
      // Update existing group
      [group] = await db
        .update(scimGroups)
        .set({
          displayName: scimGroup.displayName,
          updatedAt: new Date(),
        })
        .where(eq(scimGroups.id, existingGroup.id))
        .returning();
    } else {
      // Create new group
      [group] = await db
        .insert(scimGroups)
        .values({
          organizationId: org.id,
          externalId: scimGroup.externalId || scimGroup.displayName,
          displayName: scimGroup.displayName,
        })
        .returning();
    }
    
    // Sync group members if provided
    if (scimGroup.members && scimGroup.members.length > 0) {
      // Remove existing members
      await db
        .delete(scimGroupMembers)
        .where(eq(scimGroupMembers.groupId, group.id));
      
      // Add new members
      for (const member of scimGroup.members) {
        const userId = parseInt(member.value);
        
        // Verify user is in organization
        const [orgMember] = await db
          .select()
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.organizationId, org.id),
              eq(organizationMembers.userId, userId)
            )
          )
          .limit(1);
        
        if (orgMember) {
          await db.insert(scimGroupMembers).values({
            groupId: group.id,
            userId: userId,
          });
        }
      }
    }
    
    // Log sync event
    await db.insert(ssoAuditLog).values({
      organizationId: org.id,
      eventType: 'scim_group_synced',
      provider: 'scim',
      success: true,
      eventData: {
        groupId: group.id,
        displayName: group.displayName,
        memberCount: scimGroup.members?.length || 0,
      },
    });
    
    return new Response(JSON.stringify(await groupToSCIM(group)), {
      status: 201,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  } catch (error) {
    console.error('SCIM create group error:', error);
    
    await db.insert(ssoAuditLog).values({
      organizationId: org?.id,
      eventType: 'scim_group_synced',
      provider: 'scim',
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new Response(JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '500',
      detail: 'Failed to create group',
    } as SCIMError), {
      status: 500,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
};
