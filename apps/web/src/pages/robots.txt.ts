import type { APIRoute } from 'astro';

const siteUrl = 'https://aidepedia.com';

export const GET: APIRoute = async () => {
  const robotsTxt = `# https://www.robotstxt.org/robotstxt.html
User-agent: *
Allow: /

# Sitemap
Sitemap: ${siteUrl}/sitemap.xml

# Crawl-delay (optional, some crawlers respect this)
Crawl-delay: 1

# Disallow admin and private paths
Disallow: /auth/
Disallow: /settings/
Disallow: /api/

# Allow all crawlers to access public content
Allow: /articles
Allow: /categories
Allow: /about
Allow: /reputation
`.trim();

  return new Response(robotsTxt, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  });
};
