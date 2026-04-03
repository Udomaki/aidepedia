import type { APIContext } from 'astro';
import {
  handleScimGroup,
  createScimGroupListResponse,
  createScimError,
  validateScimToken,
  parseScimQuery,
} from '../../../../lib/auth/scim';
import { getScimGroups } from '@aidepedia/db';

export async function GET({ request, params }: APIContext) {
  try {
    const orgId = parseInt(params.orgId as string);
    
    // Validate SCIM token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify(createScimError(401, 'Missing or invalid authorization header')), {
        status: 401,
        headers: { 'Content-Type': 'application/scim+json' },
      });
    }

    const token = authHeader.substring(7);
    const isValid = await validateScimToken(orgId, token);
    
    if (!isValid) {
      return new Response(JSON.stringify(createScimError(401, 'Invalid SCIM token')), {
        status: 401,
        headers: { 'Content-Type': 'application/scim+json' },
      });
    }

    // Parse query parameters
    const query = parseScimQuery(new URL(request.url).searchParams);

    // Get groups
    const groups = await getScimGroups(orgId);

    // Transform to SCIM format
    const scimGroups = groups.map(group => ({
      id: group.id.toString(),
      displayName: group.displayName,
      externalId: group.externalId,
      memberCount: 0, // TODO: Get actual member count
    }));

    const response = createScimGroupListResponse(scimGroups, query.startIndex, groups.length);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  } catch (error) {
    console.error('SCIM GET /Groups error:', error);
    return new Response(JSON.stringify(createScimError(500, error instanceof Error ? error.message : 'Internal server error')), {
      status: 500,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
}

export async function POST({ request, params }: APIContext) {
  try {
    const orgId = parseInt(params.orgId as string);
    
    // Validate SCIM token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify(createScimError(401, 'Missing or invalid authorization header')), {
        status: 401,
        headers: { 'Content-Type': 'application/scim+json' },
      });
    }

    const token = authHeader.substring(7);
    const isValid = await validateScimToken(orgId, token);
    
    if (!isValid) {
      return new Response(JSON.stringify(createScimError(401, 'Invalid SCIM token')), {
        status: 401,
        headers: { 'Content-Type': 'application/scim+json' },
      });
    }

    // Parse SCIM group
    const scimGroup = await request.json();

    // Validate required fields
    if (!scimGroup.displayName) {
      return new Response(JSON.stringify(createScimError(400, 'displayName is required')), {
        status: 400,
        headers: { 'Content-Type': 'application/scim+json' },
      });
    }

    // Sync group
    const result = await handleScimGroup(orgId, scimGroup);

    // Return created group
    const response = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: result.groupId.toString(),
      externalId: scimGroup.externalId,
      displayName: scimGroup.displayName,
      members: scimGroup.members || [],
      meta: {
        resourceType: 'Group',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        location: `${new URL(request.url).origin}/api/scim/v2/organizations/${orgId}/Groups/${result.groupId}`,
      },
    };

    return new Response(JSON.stringify(response), {
      status: result.created ? 201 : 200,
      headers: { 
        'Content-Type': 'application/scim+json',
        'Location': response.meta.location,
      },
    });
  } catch (error) {
    console.error('SCIM POST /Groups error:', error);
    return new Response(JSON.stringify(createScimError(500, error instanceof Error ? error.message : 'Internal server error')), {
      status: 500,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
}
