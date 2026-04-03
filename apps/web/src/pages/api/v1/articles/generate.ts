/**
 * API Endpoint: Generate Article from Outline
 * POST /api/v1/articles/generate
 */

import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { db, eq } from '@aidepedia/db';
import { article_outlines, articles } from '@aidepedia/db/schema';
import {
  generateArticleFromOutline,
  estimateReadingTime,
  type ArticleOutline
} from '../../../../lib/article-generation';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Check authentication
    const session = await getSession(request);
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = parseInt(session.user.id as string, 10);
    const body = await request.json();

    // Validate outline
    const { outline, options = {} } = body as {
      outline: ArticleOutline;
      options?: {
        provider?: 'openai' | 'claude';
        model?: string;
        citationFormat?: 'apa' | 'mla';
      };
    };

    if (!outline || !outline.title || !outline.sections || outline.sections.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid outline' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create outline record
    const [outlineRecord] = await db.insert(article_outlines).values({
      title: outline.title,
      outline: { sections: outline.sections },
      userId,
      status: 'generating'
    }).returning();

    try {
      // Generate article
      const generated = await generateArticleFromOutline(outline, {
        provider: options.provider || 'openai',
        model: options.model,
        citationFormat: options.citationFormat || 'apa'
      });

      // Generate slug from title
      const slug = outline.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Calculate reading time
      const readingTime = estimateReadingTime(generated.content);

      // Create article
      const [article] = await db.insert(articles).values({
        title: generated.title,
        slug,
        content: generated.content,
        excerpt: generated.excerpt,
        status: 'draft',
        authorId: userId,
        readingTime,
        qualityScore: 0 // Will be calculated by quality validator
      }).returning();

      // Update outline with generated article ID
      await db.update(article_outlines)
        .set({
          generatedArticleId: article.id,
          status: 'generated',
          updatedAt: new Date()
        })
        .where(eq(article_outlines.id, outlineRecord.id));

      return new Response(JSON.stringify({
        success: true,
        data: {
          article,
          citations: generated.citations,
          outline: outlineRecord
        }
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (genError) {
      // Update outline status to failed
      await db.update(article_outlines)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(article_outlines.id, outlineRecord.id));

      throw genError;
    }

  } catch (error) {
    console.error('Article generation error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate article',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
