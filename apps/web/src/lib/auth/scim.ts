import type { ScimUserSchema, ScimGroupSchema, ScimListResponse, ScimError } from '@aidepedia/db';
import {
  upsertScimUser,
  deactivateScimUser,
  getScimGroups,
  upsertScimGroup,
  syncScimGroupMembers,
  createSsoAuditLog,
  findUserByEmail,
} from '@aidepedia/db';

/**
 * Handle SCIM user provisioning
 */
export async function handleScimUser(
  organizationId: number,
  scimUser: ScimUserSchema
): Promise<{ userId: number; created: boolean }> {
  const email = scimUser.emails?.[0]?.value;
  
  if (!email) {
    throw new Error('Email is required');
  }

  // Check if user already exists
  const existingUser = await findUserByEmail(email);
  const created = !existingUser;

  // Create or update user
  const user = await upsertScimUser(
    organizationId,
    email,
    scimUser.displayName || scimUser.name?.formatted || scimUser.userName,
    scimUser.externalId
  );

  // Log the provisioning event
  await createSsoAuditLog({
    organizationId,
    userId: user.id,
    eventType: created ? 'scim_user_provisioned' : 'scim_user_updated',
    success: true,
    eventData: {
      externalId: scimUser.externalId,
      userName: scimUser.userName,
    },
  });

  return { userId: user.id, created };
}

/**
 * Handle SCIM user deprovisioning
 */
export async function handleScimUserDeprovision(
  organizationId: number,
  externalId: string
): Promise<void> {
  await deactivateScimUser(organizationId, externalId);

  await createSsoAuditLog({
    organizationId,
    eventType: 'scim_user_deprovisioned',
    success: true,
    eventData: {
      externalId,
    },
  });
}

/**
 * Handle SCIM group sync
 */
export async function handleScimGroup(
  organizationId: number,
  scimGroup: ScimGroupSchema,
  memberUserIds?: number[]
): Promise<{ groupId: number; created: boolean }> {
  if (!scimGroup.externalId) {
    throw new Error('External ID is required');
  }

  // Check if group already exists
  const existingGroups = await getScimGroups(organizationId);
  const existingGroup = existingGroups.find(g => g.externalId === scimGroup.externalId);
  const created = !existingGroup;

  // Create or update group
  const group = await upsertScimGroup(
    organizationId,
    scimGroup.externalId,
    scimGroup.displayName
  );

  // Sync group members if provided
  if (memberUserIds && memberUserIds.length > 0) {
    await syncScimGroupMembers(group.id, memberUserIds);
  }

  // Log the group sync event
  await createSsoAuditLog({
    organizationId,
    eventType: 'scim_group_synced',
    success: true,
    eventData: {
      groupId: group.id,
      externalId: scimGroup.externalId,
      displayName: scimGroup.displayName,
      memberCount: memberUserIds?.length || 0,
    },
  });

  return { groupId: group.id, created };
}

/**
 * Create SCIM list response for users
 */
export function createScimUserListResponse(
  users: Array<{
    id: number;
    email: string;
    name: string | null;
    externalId?: string | null;
    active?: boolean;
  }>,
  startIndex: number = 1,
  totalCount?: number
): ScimListResponse<ScimUserSchema> {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: totalCount ?? users.length,
    startIndex,
    itemsPerPage: users.length,
    Resources: users.map(user => ({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id.toString(),
      externalId: user.externalId || undefined,
      userName: user.email,
      name: {
        formatted: user.name || undefined,
      },
      displayName: user.name || undefined,
      emails: [
        {
          value: user.email,
          type: 'work',
          primary: true,
        },
      ],
      active: user.active ?? true,
    })),
  };
}

/**
 * Create SCIM list response for groups
 */
export function createScimGroupListResponse(
  groups: Array<{
    id: number;
    displayName: string;
    externalId: string;
    memberCount?: number;
  }>,
  startIndex: number = 1,
  totalCount?: number
): ScimListResponse<ScimGroupSchema> {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: totalCount ?? groups.length,
    startIndex,
    itemsPerPage: groups.length,
    Resources: groups.map(group => ({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: group.id.toString(),
      externalId: group.externalId,
      displayName: group.displayName,
    })),
  };
}

/**
 * Create SCIM error response
 */
export function createScimError(
  status: number,
  detail?: string,
  scimType?: ScimError['scimType']
): ScimError {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: status.toString(),
    detail,
    scimType,
  };
}

/**
 * Validate SCIM bearer token
 */
export async function validateScimToken(
  organizationId: number,
  token: string
): Promise<boolean> {
  const { getSsoConfiguration } = await import('@aidepedia/db');
  const config = await getSsoConfiguration(organizationId);

  if (!config?.scim?.enabled) {
    return false;
  }

  return config.scim.bearerToken === token;
}

/**
 * Parse SCIM query parameters
 */
export function parseScimQuery(query: URLSearchParams): {
  startIndex: number;
  count: number;
  filter?: string;
  sortBy?: string;
  sortOrder?: 'ascending' | 'descending';
} {
  return {
    startIndex: parseInt(query.get('startIndex') || '1'),
    count: Math.min(parseInt(query.get('count') || '100'), 200), // Max 200
    filter: query.get('filter') || undefined,
    sortBy: query.get('sortBy') || undefined,
    sortOrder: (query.get('sortOrder') as 'ascending' | 'descending') || undefined,
  };
}
