import type { APIRoute } from 'astro';
import { rejectArticle } from '@aidepedia/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const articleId = parseInt(formData.get('articleId') as string);
  const reason = formData.get('reason') as string || 'Rejected by moderator';
  
  // In production, you'd get the editor ID from the session
  // For now, we'll use a default admin ID
  const editorId = 1; // TODO: Get from session

  try {
    await rejectArticle(articleId, editorId, reason);
    
    // Redirect back to moderation queue
    return redirect('/admin/moderation?success=rejected');
  } catch (error) {
    console.error('Error rejecting article:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Failed to reject article' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
