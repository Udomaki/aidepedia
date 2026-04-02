import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const items = formData.getAll('item');
    
    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Process bulk actions
    const results = await Promise.all(
      items.map(async (item: string) => {
        const itemData = formData.get(`${item}_action`);
        if (!itemData) {
          return { error: 'Missing action data' };
        }
        
        const [type, id, action] = itemData.toString().split('|');
        
        if (!type || !id || !action) {
          return { error: 'Missing required fields' };
        }
        
        // Handle different actions
        if (type === 'approve-article') {
          const { approveArticle } = await import('@aidepedia/db');
          await approveArticle(parseInt(id), 1);
        } else if (type === 'reject-article') {
          const { updateArticle } = await import('@aidepedia/db');
          await updateArticle(parseInt(id), {
            status: 'rejected',
            updatedAt: new Date(),
          });
        }
        
        return { success: true };
      })
    );

    return new Response(JSON.stringify({ 
      success: true,
      processed: items.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Bulk action error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Bulk action failed' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
