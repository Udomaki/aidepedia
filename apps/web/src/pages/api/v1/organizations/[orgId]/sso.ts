import type { APIContext } from 'astro';
import { 
  getSsoConfiguration, 
  createIdentityProvider, 
  updateIdentityProvider, 
  deleteIdentityProvider,
  createSsoAuditLog 
} from '@aidepedia/db';
import type { NewSsoIdentityProvider } from '@aidepedia/db';

export async function GET({ params }: APIContext) {
  try {
    const organizationId = parseInt(params.orgId as string);
    const config = await getSsoConfiguration(organizationId);

    return new Response(JSON.stringify(config), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST({ request, params }: APIContext) {
  try {
    const organizationId = parseInt(params.orgId as string);
    const data = await request.json();

    // Create identity provider
    const idp = await createIdentityProvider({
      organizationId,
      name: data.name,
      type: data.type,
      domain: data.domain,
      
      // SAML fields
      samlMetadataUrl: data.samlMetadataUrl,
      samlMetadataXml: data.samlMetadataXml,
      samlEntryPoint: data.samlEntryPoint,
      samlCertificate: data.samlCertificate,
      samlIssuer: data.samlIssuer,
      
      // OIDC fields
      oidcClientId: data.oidcClientId,
      oidcClientSecret: data.oidcClientSecret,
      oidcDiscoveryUrl: data.oidcDiscoveryUrl,
      oidcIssuer: data.oidcIssuer,
      
      priority: data.priority || 100,
      isActive: data.isActive ?? true,
    } as NewSsoIdentityProvider);

    // Log the creation
    await createSsoAuditLog({
      organizationId,
      eventType: 'sso_enforcement_triggered',
      success: true,
      eventData: {
        action: 'idp_created',
        idpId: idp.id,
        idpName: idp.name,
        idpType: idp.type,
      },
    });

    return new Response(JSON.stringify(idp), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function PUT({ request, params }: APIContext) {
  try {
    const organizationId = parseInt(params.orgId as string);
    const data = await request.json();

    // Update identity provider
    const idp = await updateIdentityProvider(data.id, {
      name: data.name,
      type: data.type,
      domain: data.domain,
      
      // SAML fields
      samlMetadataUrl: data.samlMetadataUrl,
      samlMetadataXml: data.samlMetadataXml,
      samlEntryPoint: data.samlEntryPoint,
      samlCertificate: data.samlCertificate,
      samlIssuer: data.samlIssuer,
      
      // OIDC fields
      oidcClientId: data.oidcClientId,
      oidcClientSecret: data.oidcClientSecret,
      oidcDiscoveryUrl: data.oidcDiscoveryUrl,
      oidcIssuer: data.oidcIssuer,
      
      priority: data.priority,
      isActive: data.isActive,
    });

    // Log the update
    await createSsoAuditLog({
      organizationId,
      eventType: 'sso_enforcement_triggered',
      success: true,
      eventData: {
        action: 'idp_updated',
        idpId: idp.id,
        idpName: idp.name,
        idpType: idp.type,
      },
    });

    return new Response(JSON.stringify(idp), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE({ request, params }: APIContext) {
  try {
    const organizationId = parseInt(params.orgId as string);
    const url = new URL(request.url);
    const idpId = parseInt(url.searchParams.get('id') as string);

    // Delete identity provider
    await deleteIdentityProvider(idpId);

    // Log the deletion
    await createSsoAuditLog({
      organizationId,
      eventType: 'sso_enforcement_triggered',
      success: true,
      eventData: {
        action: 'idp_deleted',
        idpId,
      },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
