import { restoreBackup, getBackup } from '@aidepedia/db/backup';
import type { APIRoute } from 'astro';

export const prerender: boolean = false;

// POST /api/v1/admin/backups/[id]/restore - Restore from a backup
export const POST: APIRoute = async ({ params, locals }) => {
  try {
    const backupId = parseInt(params.id!);

    if (isNaN(backupId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid backup ID' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if backup exists
    const backup = await getBackup(backupId);
    if (!backup) {
      return new Response(
        JSON.stringify({ error: 'Backup not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Restore the backup
    await restoreBackup(backupId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Backup restored successfully',
        backup: {
          id: backup.id,
          filename: backup.filename,
          restoredAt: new Date().toISOString(),
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error restoring backup:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to restore backup',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
