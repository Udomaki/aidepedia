// OC-121: Article Translations API

import type { APIRoute } from 'astro';
import { db, eq, and } from '@aidepedia/db';
import { article_translations, articles, languages } from '@aidepedia/db/schema';

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const articleId = parseInt(params.id!);
    const languageCode = url.searchParams.get('lang');
    
    if (!articleId) {
      return new Response(JSON.stringify({ error: 'Article ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (languageCode) {
      // Get translation for specific language
      const translation = await db
        .select()
        .from(article_translations)
        .where(and(
          eq(article_translations.articleId, articleId),
          eq(article_translations.languageCode, languageCode)
        ))
        .limit(1);
      
      if (translation.length === 0) {
        return new Response(JSON.stringify({ error: 'Translation not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(translation[0]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      // Get all translations for article
      const allTranslations = await db
        .select({
          translation: article_translations,
          language: languages
        })
        .from(article_translations)
        .innerJoin(languages, eq(article_translations.languageCode, languages.code))
        .where(eq(article_translations.articleId, articleId));
      
      return new Response(JSON.stringify(allTranslations), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('Error fetching article translations:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const articleId = parseInt(params.id!);
    const body = await request.json();
    
    if (!articleId) {
      return new Response(JSON.stringify({ error: 'Article ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { languageCode, title, content, excerpt, slug, translatorId } = body;
    
    if (!languageCode || !title || !content || !slug) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Check if translation already exists
    const existing = await db
      .select()
      .from(article_translations)
      .where(and(
        eq(article_translations.articleId, articleId),
        eq(article_translations.languageCode, languageCode)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      return new Response(JSON.stringify({ error: 'Translation already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Create new translation
    const [translation] = await db
      .insert(article_translations)
      .values({
        articleId,
        languageCode,
        title,
        content,
        excerpt: excerpt || null,
        slug,
        translatorId: translatorId || null,
        status: 'draft'
      })
      .returning();
    
    return new Response(JSON.stringify(translation), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating article translation:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const articleId = parseInt(params.id!);
    const body = await request.json();
    
    if (!articleId) {
      return new Response(JSON.stringify({ error: 'Article ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const { languageCode, title, content, excerpt, status, reviewerId } = body;
    
    if (!languageCode) {
      return new Response(JSON.stringify({ error: 'Language code is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Update translation
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (title) updateData.title = title;
    if (content) updateData.content = content;
    if (excerpt !== undefined) updateData.excerpt = excerpt;
    if (status) updateData.status = status;
    if (reviewerId) updateData.reviewerId = reviewerId;
    if (status === 'published') updateData.publishedAt = new Date();
    
    const [updated] = await db
      .update(article_translations)
      .set(updateData)
      .where(and(
        eq(article_translations.articleId, articleId),
        eq(article_translations.languageCode, languageCode)
      ))
      .returning();
    
    if (!updated) {
      return new Response(JSON.stringify({ error: 'Translation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating article translation:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ params, url }) => {
  try {
    const articleId = parseInt(params.id!);
    const languageCode = url.searchParams.get('lang');
    
    if (!articleId || !languageCode) {
      return new Response(JSON.stringify({ error: 'Article ID and language code are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const [deleted] = await db
      .delete(article_translations)
      .where(and(
        eq(article_translations.articleId, articleId),
        eq(article_translations.languageCode, languageCode)
      ))
      .returning();
    
    if (!deleted) {
      return new Response(JSON.stringify({ error: 'Translation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting article translation:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
