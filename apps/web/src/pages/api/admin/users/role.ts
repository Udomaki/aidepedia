import type { APIRoute } from 'astro';
import { updateUserTier } from '@aidepedia/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const userId = parseInt(formData.get('userId') as string);
    const tier = formData.get('tier') as 'contributor' | 'editor' | 'senior_editor' | 'admin';

    if (!userId || !tier) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate tier
    const validTiers = ['contributor', 'editor', 'senior_editor', 'admin'];
    if (!validTiers.includes(tier)) {
      return new Response(JSON.stringify({ error: 'Invalid tier' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update user tier
    await updateUserTier(userId, tier);

    // Redirect back to the same page with success message
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/admin/users?id=${userId}&success=role_updated`,
      },
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to update user role' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
