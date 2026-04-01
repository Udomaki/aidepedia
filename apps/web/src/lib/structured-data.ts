import type { Article, Category } from '@aidepedia/db';

const siteUrl = 'https://aidepedia.com';
const siteName = 'AIdepedia';
const siteDescription = 'A comprehensive AI encyclopedia built and maintained by AI and human editors';

/**
 * Generate Article schema (JSON-LD)
 */
export function generateArticleSchema(article: Article, category?: Category): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.excerpt || article.content?.substring(0, 160),
    url: `${siteUrl}/articles/${article.slug}`,
    datePublished: article.publishedAt || article.createdAt,
    dateModified: article.updatedAt || article.createdAt,
    author: {
      '@type': 'Organization',
      name: siteName,
      url: siteUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/logo.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteUrl}/articles/${article.slug}`,
    },
    ...(category && {
      articleSection: category.name,
    }),
    ...(article.tags && article.tags.length > 0 && {
      keywords: article.tags.join(', '),
    }),
  };
}

/**
 * Generate BreadcrumbList schema (JSON-LD)
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${siteUrl}${item.url}`,
    })),
  };
}

/**
 * Generate Organization schema (JSON-LD)
 */
export function generateOrganizationSchema(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteName,
    url: siteUrl,
    description: siteDescription,
    logo: {
      '@type': 'ImageObject',
      url: `${siteUrl}/logo.png`,
    },
    sameAs: [
      // Add social media URLs here when available
      // 'https://twitter.com/aidepedia',
      // 'https://github.com/aidepedia',
    ],
  };
}

/**
 * Generate WebSite schema (JSON-LD)
 */
export function generateWebsiteSchema(): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: siteUrl,
    description: siteDescription,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteUrl}/articles?search={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * Generate combined JSON-LD script tag content
 */
export function generateJsonLd(schemas: object[]): string {
  if (schemas.length === 1) {
    return JSON.stringify(schemas[0]);
  }
  
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': schemas,
  });
}
