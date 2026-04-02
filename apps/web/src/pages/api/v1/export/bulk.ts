import type { APIRoute } from 'astro';
import { listArticles, getCategories } from '@aidepedia/db';
import { exportBulk, type ExportOptions } from '../../../../lib/export';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      format = 'json',
      includeMetadata = true,
      includeImages = true,
      category,
      status = 'published',
      limit = 50,
      slugs,
    } = body;

    if (!['pdf', 'markdown', 'json'].includes(format)) {
      return new Response(JSON.stringify({ error: 'Invalid format. Use pdf, markdown, or json' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch articles
    let articles;
    if (slugs && Array.isArray(slugs) && slugs.length > 0) {
      // Export specific articles by slug
      const { getArticleBySlug } = await import('@aidepedia/db');
      const articlePromises = slugs.map((slug: string) => getArticleBySlug(slug));
      const results = await Promise.allSettled(articlePromises);
      articles = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value)
        .filter((a: any) => a.status === 'published');
    } else {
      // Export articles with filters
      const options: any = {
        status,
        limit: Math.min(limit, 100), // Cap at 100 articles
      };

      if (category) {
        // Get category ID from slug
        const categories = await getCategories();
        const categoryObj = categories.find(c => c.slug === category);
        if (categoryObj) {
          options.categoryId = categoryObj.id;
        }
      }

      const result = await listArticles(options);
      articles = result.data;
    }

    if (!articles || articles.length === 0) {
      return new Response(JSON.stringify({ error: 'No articles found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const exportOptions: ExportOptions = {
      includeMetadata,
      includeImages,
      format: format as 'pdf' | 'markdown' | 'json',
    };

    const zipBuffer = await exportBulk(articles, format as 'pdf' | 'markdown' | 'json', exportOptions);

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `aidepedia-export-${timestamp}.zip`;

    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Bulk export error:', error);
    return new Response(JSON.stringify({ error: 'Failed to export articles' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
