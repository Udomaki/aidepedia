import type { APIRoute } from 'astro';
import { listArticles, getCategories } from '@aidepedia/db';

const siteUrl = 'https://aidepedia.com';

function formatDate(date: Date | null | undefined): string {
  if (!date) return new Date().toISOString().split('T')[0];
  return new Date(date).toISOString().split('T')[0];
}

export const GET: APIRoute = async () => {
  try {
    // Fetch all published articles
    const articlesResult = await listArticles({ 
      status: 'published', 
      limit: 10000,
      sortBy: 'date',
      sortOrder: 'desc'
    });
    
    // Fetch all categories
    const categories = await getCategories();

    // Static pages with their priorities and change frequencies
    const staticPages = [
      { path: '', changefreq: 'daily', priority: 1.0 },
      { path: '/about', changefreq: 'monthly', priority: 0.6 },
      { path: '/articles', changefreq: 'daily', priority: 0.9 },
      { path: '/reputation', changefreq: 'daily', priority: 0.7 },
    ];

    // Build sitemap entries
    const urls: string[] = [];

    // Add static pages
    staticPages.forEach(page => {
      urls.push(`  <url>
    <loc>${new URL(page.path, siteUrl).toString()}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`);
    });

    // Add article pages
    articlesResult.data.forEach(article => {
      const lastmod = article.updatedAt || article.publishedAt || article.createdAt;
      urls.push(`  <url>
    <loc>${new URL(`/articles/${article.slug}`, siteUrl).toString()}</loc>
    <lastmod>${formatDate(lastmod)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
    });

    // Add category pages
    categories.forEach(category => {
      urls.push(`  <url>
    <loc>${new URL(`/categories/${category.slug}`, siteUrl).toString()}</loc>
    <lastmod>${formatDate(category.updatedAt || category.createdAt)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
    });

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`.trim();

    return new Response(sitemap, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Error generating sitemap:', error);
    
    // Return a basic sitemap even if there's an error
    const fallbackSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteUrl}/about</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${siteUrl}/articles</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`.trim();

    return new Response(fallbackSitemap, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  }
};
