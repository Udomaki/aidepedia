// OC-121: Languages API

import type { APIRoute } from 'astro';
import { db, eq } from '@aidepedia/db';
import { languages } from '@aidepedia/db/schema';

export const GET: APIRoute = async ({ url }) => {
  try {
    const enabledOnly = url.searchParams.get('enabled') === 'true';
    
    let allLanguages;
    if (enabledOnly) {
      allLanguages = await db
        .select()
        .from(languages)
        .where(eq(languages.enabled, true))
        .orderBy(languages.displayOrder);
    } else {
      allLanguages = await db
        .select()
        .from(languages)
        .orderBy(languages.displayOrder);
    }
    
    return new Response(JSON.stringify(allLanguages), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
      }
    });
  } catch (error) {
    console.error('Error fetching languages:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { code, name, nativeName, direction, displayOrder } = body;
    
    if (!code || !name || !nativeName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const [language] = await db
      .insert(languages)
      .values({
        code,
        name,
        nativeName,
        direction: direction || 'ltr',
        enabled: true,
        isDefault: false,
        displayOrder: displayOrder || 0
      })
      .returning();
    
    return new Response(JSON.stringify(language), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating language:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
