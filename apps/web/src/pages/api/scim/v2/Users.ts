import type { APIContext } from 'astro';
import {
  handleScimUser,
  createScimUserListResponse,
  createScimError,
  validateScimToken,
  parseScimQuery,
} from '../../../../lib/auth/scim';
import { getOrganizationByDomain, findUserByEmail, organization_members } from '@aidepedia/db';

export async function GET({ request, params }: APIContext) {
  try {
    // Extract organization ID from path or header
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

    // TODO: Implement actual user listing with pagination and filtering
    // For now, return empty list
    const response = createScimUserListResponse([], query.startIndex, 0);

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  } catch (error) {
    console.error('SCIM GET /Users error:', error);
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

    // Parse SCIM user
    const scimUser = await request.json();

    // Validate required fields
    if (!scimUser.userName && !scimUser.emails?.[0]?.value) {
      return new Response(JSON.stringify(createScimError(400, 'userName or email is required')), {
        status: 400,
        headers: { 'Content-Type': 'application/scim+json' },
      });
    }

    // Provision user
    const result = await handleScimUser(orgId, scimUser);

    // Return created user
    const response = {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: result.userId.toString(),
      externalId: scimUser.externalId,
      userName: scimUser.userName || scimUser.emails[0].value,
      name: scimUser.name,
      displayName: scimUser.displayName,
      emails: scimUser.emails,
      active: true,
      meta: {
        resourceType: 'User',
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        location: `${new URL(request.url).origin}/api/scim/v2/organizations/${orgId}/Users/${result.userId}`,
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
    console.error('SCIM POST /Users error:', error);
    return new Response(JSON.stringify(createScimError(500, error instanceof Error ? error.message : 'Internal server error')), {
      status: 500,
      headers: { 'Content-Type': 'application/scim+json' },
    });
  }
}
