import type { APIRoute } from 'astro';
import { approveArticle } from '@aidepedia/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const articleId = parseInt(formData.get('articleId') as string);
  
  // In production, you'd get the editor ID from the session
  // For now, we'll use a default admin ID
  const editorId = 1; // TODO: Get from session

  try {
    await approveArticle(articleId, editorId);
    
    // Redirect back to moderation queue
    return redirect('/admin/moderation?success=approved');
  } catch (error) {
    console.error('Error approving article:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to approve article' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
