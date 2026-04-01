import type { APIRoute } from 'astro';
import { setUserActiveStatus } from '@aidepedia/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const userId = parseInt(formData.get('userId') as string);
  const isActive = formData.get('isActive') === 'true';

  try {
    await setUserActiveStatus(userId, isActive);
    
    // Redirect back to the user management page
    return redirect(`/admin/users?id=${userId}`);
  } catch (error) {
    console.error('Error updating user status:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to update user status' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
