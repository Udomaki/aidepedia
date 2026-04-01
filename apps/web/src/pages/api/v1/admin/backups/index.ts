import { createBackup, listBackups, getBackupStats } from '@aidepedia/db/backup';
import type { APIRoute } from 'astro';

export const prerender = false;

// GET /api/v1/admin/backups - List all backups
export const GET: APIRoute = async ({ url }) => {
  try {
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const result = await listBackups(limit, offset);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error listing backups:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to list backups' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

// POST /api/v1/admin/backups - Create a new backup
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = locals.user?.id ? parseInt(locals.user.id) : undefined;
    const backup = await createBackup(userId);

    return new Response(JSON.stringify(backup), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating backup:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to create backup',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
