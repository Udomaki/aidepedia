/**
 * API Endpoint: Manage Article Citations
 * GET /api/v1/articles/:slug/citations - Get citations
 * POST /api/v1/articles/:slug/citations - Add citation
 */

import type { APIRoute } from 'astro';
import { db, eq } from '@aidepedia/db';
import { articles, article_citations } from '@aidepedia/db/schema';
import { generateCitation } from '../../../../../lib/article-generation';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get article
    const [article] = await db.select()
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);

    if (!article) {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get citations
    const citations = await db.select()
      .from(article_citations)
      .where(eq(article_citations.articleId, article.id));

    return new Response(JSON.stringify({
      success: true,
      data: citations
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Get citations error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get citations',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request, params }) => {
  try {
    const { slug } = params;

    if (!slug) {
      return new Response(JSON.stringify({ error: 'Slug is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get article
    const [article] = await db.select()
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);

    if (!article) {
      return new Response(JSON.stringify({ error: 'Article not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { source, title, authors, publicationDate, url, doi, citationFormat = 'apa' } = body;

    if (!source) {
      return new Response(JSON.stringify({ error: 'Source is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate citation
    const citation = generateCitation(
      { source, title, authors, publicationDate, url, doi },
      citationFormat
    );

    // Save citation
    const [savedCitation] = await db.insert(article_citations).values({
      articleId: article.id,
      source: citation.source,
      title: citation.title,
      authors: citation.authors,
      publicationDate: citation.publicationDate,
      url: citation.url,
      doi: citation.doi,
      citationFormat: citation.citationFormat,
      citationText: citation.citationText,
      qualityScore: citation.qualityScore,
      qualityFlags: citation.qualityFlags
    }).returning();

    return new Response(JSON.stringify({
      success: true,
      data: savedCitation
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Add citation error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to add citation',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
