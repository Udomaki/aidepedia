import type { APIRoute } from 'astro';
import { getSession } from 'auth-astro/server';
import { db } from '@aidepedia/db';
import { users } from '@aidepedia/db/schema';
import { eq } from '@aidepedia/db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const session = await getSession(request);
    
    if (!session?.user?.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json();
    const { name, bio, image } = body;

    await db
      .update(users)
      .set({
        name: name || null,
        bio: bio || null,
        image: image || null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, parseInt(session.user.id)));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
