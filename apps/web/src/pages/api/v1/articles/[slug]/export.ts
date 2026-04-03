import type { APIRoute } from 'astro';
import { getArticleBySlug } from '@aidepedia/db';
import { exportToPDF, exportToMarkdown, exportToJSON, type ExportOptions } from '../../../../../lib/export';

export const GET: APIRoute = async ({ params, url }) => {
  const { slug } = params;
  const format = url.searchParams.get('format') || 'json';
  const includeMetadata = url.searchParams.get('includeMetadata') !== 'false';
  const includeImages = url.searchParams.get('includeImages') !== 'false';

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Article slug is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!['pdf', 'markdown', 'json'].includes(format)) {
    return new Response(JSON.stringify({ error: 'Invalid format. Use pdf, markdown, or json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const article = await getArticleBySlug(slug);
    
    if (!article) {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (article.status !== 'published') {
      return new Response(JSON.stringify({ error: 'Article is not published' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const options: ExportOptions = {
      includeMetadata,
      includeImages,
      format: format as 'pdf' | 'markdown' | 'json',
    };

    let content: BodyInit;
    let contentType: string;
    let extension: string;

    switch (format) {
      case 'pdf':
        const pdfBuffer = await exportToPDF(article, options);
        content = pdfBuffer;
        contentType = 'application/pdf';
        extension = 'pdf';
        break;
      case 'markdown':
        content = await exportToMarkdown(article, options);
        contentType = 'text/markdown';
        extension = 'md';
        break;
      case 'json':
      default:
        content = await exportToJSON(article, options);
        contentType = 'application/json';
        extension = 'json';
        break;
    }

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${article.slug}.${extension}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return new Response(JSON.stringify({ error: 'Failed to export article' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
