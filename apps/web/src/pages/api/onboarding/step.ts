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
    const { step } = body;

    const validSteps = ['welcome', 'profile', 'interests', 'complete'];
    if (!validSteps.includes(step)) {
      return new Response(JSON.stringify({ error: 'Invalid step' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await db
      .update(users)
      .set({ onboardingStep: step })
      .where(eq(users.id, parseInt(session.user.id)));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating onboarding step:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
