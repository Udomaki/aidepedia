import { createBackup, cleanupOldBackups, getBackupStats } from '@aidepedia/db/backup';
import type { APIRoute } from 'astro';

export const prerender: boolean = false;

// POST /api/v1/admin/backups/cron - Scheduled backup endpoint
export const POST: APIRoute = async ({ request }) => {
  try {
    // Verify cron secret (optional but recommended for security)
    const cronSecret = request.headers.get('X-Cron-Secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (expectedSecret && cronSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Create a new backup
    const backup = await createBackup();

    // Clean up old backups
    const deletedCount = await cleanupOldBackups();

    // Get stats
    const stats = await getBackupStats();

    // Send notification (optional)
    if (process.env.BACKUP_NOTIFICATION_WEBHOOK) {
      try {
        await fetch(process.env.BACKUP_NOTIFICATION_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: backup.status === 'completed' ? 'backup_success' : 'backup_failed',
            backup: {
              id: backup.id,
              filename: backup.filename,
              size: backup.size,
              status: backup.status,
              error: backup.error,
            },
            cleanup: {
              deletedCount,
              retentionDays: process.env.BACKUP_RETENTION_DAYS || '30',
            },
            stats,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (notificationError) {
        console.error('Failed to send backup notification:', notificationError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        backup: {
          id: backup.id,
          filename: backup.filename,
          size: backup.size,
          status: backup.status,
        },
        cleanup: {
          deletedCount,
        },
        stats,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in backup cron:', error);

    // Send failure notification
    if (process.env.BACKUP_NOTIFICATION_WEBHOOK) {
      try {
        await fetch(process.env.BACKUP_NOTIFICATION_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'backup_failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (notificationError) {
        console.error('Failed to send failure notification:', notificationError);
      }
    }

    return new Response(
      JSON.stringify({
        error: 'Backup cron failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
