import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { db, backups } from './index';
import { desc, lt, and, eq } from 'drizzle-orm';
import { Readable } from 'stream';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

// S3 client configuration
const s3Client = new S3Client({
  region: process.env.S3_REGION || 'auto',
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'aidepedia-backups';
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30');

interface BackupMetadata {
  id: number;
  filename: string;
  size: number;
  status: string;
  storageKey: string | null;
  storageUrl: string | null;
  error: string | null;
  createdBy: number | null;
  completedAt: Date | null;
  createdAt: Date | null;
}

/**
 * Create a database backup
 */
export async function createBackup(userId?: number): Promise<BackupMetadata> {
  // Create backup record
  const [backup] = await db
    .insert(backups)
    .values({
      filename: `backup-${Date.now()}.sql`,
      size: 0,
      status: 'pending',
      createdBy: userId,
    })
    .returning();

  try {
    // Update status to in_progress
    await db
      .update(backups)
      .set({ status: 'in_progress' })
      .where(eq(backups.id, backup.id));

    // Create backup file using pg_dump
    const backupPath = join('/tmp', backup.filename);
    const databaseUrl = process.env.DATABASE_URL!;
    
    await execAsync(`pg_dump "${databaseUrl}" > "${backupPath}"`);

    // Read the backup file
    const backupData = await readFile(backupPath);
    const size = backupData.length;

    // Upload to S3
    const storageKey = `backups/${backup.filename}`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: storageKey,
        Body: backupData,
        ContentType: 'application/sql',
        Metadata: {
          'backup-id': backup.id.toString(),
          'created-at': new Date().toISOString(),
        },
      })
    );

    const storageUrl = `${process.env.S3_ENDPOINT}/${BUCKET_NAME}/${storageKey}`;

    // Update backup record
    const [updatedBackup] = await db
      .update(backups)
      .set({
        size,
        status: 'completed',
        storageKey,
        storageUrl,
        completedAt: new Date(),
      })
      .where(eq(backups.id, backup.id))
      .returning();

    // Clean up local file
    await unlink(backupPath);

    return updatedBackup;
  } catch (error) {
    // Update backup record with error
    await db
      .update(backups)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      .where(eq(backups.id, backup.id));

    throw error;
  }
}

/**
 * List all backups
 */
export async function listBackups(limit = 50, offset = 0): Promise<{ data: BackupMetadata[]; total: number }> {
  const data = await db
    .select()
    .from(backups)
    .orderBy(desc(backups.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const allBackups = await db.select().from(backups);
  const total = allBackups.length;

  return { data, total };
}

/**
 * Get a specific backup
 */
export async function getBackup(backupId: number): Promise<BackupMetadata | null> {
  const [backup] = await db
    .select()
    .from(backups)
    .where(eq(backups.id, backupId))
    .limit(1);

  return backup || null;
}

/**
 * Restore from a backup
 */
export async function restoreBackup(backupId: number): Promise<void> {
  const backup = await getBackup(backupId);

  if (!backup) {
    throw new Error('Backup not found');
  }

  if (backup.status !== 'completed') {
    throw new Error('Backup is not completed');
  }

  if (!backup.storageKey) {
    throw new Error('Backup has no storage key');
  }

  try {
    // Download from S3
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: backup.storageKey,
      })
    );

    if (!response.Body) {
      throw new Error('No backup data found in S3');
    }

    // Save to temp file
    const restorePath = join('/tmp', `restore-${backup.filename}`);
    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    await writeFile(restorePath, Buffer.concat(chunks));

    // Restore using psql
    const databaseUrl = process.env.DATABASE_URL!;
    await execAsync(`psql "${databaseUrl}" < "${restorePath}"`);

    // Clean up
    await unlink(restorePath);
  } catch (error) {
    throw new Error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete old backups (retention policy)
 */
export async function cleanupOldBackups(): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - BACKUP_RETENTION_DAYS);

  // Get old backups
  const oldBackups = await db
    .select()
    .from(backups)
    .where(lt(backups.createdAt, cutoffDate));

  // Delete from S3 and database
  let deletedCount = 0;
  for (const backup of oldBackups) {
    try {
      if (backup.storageKey) {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: backup.storageKey,
          })
        );
      }

      await db.delete(backups).where(eq(backups.id, backup.id));
      deletedCount++;
    } catch (error) {
      console.error(`Failed to delete backup ${backup.id}:`, error);
    }
  }

  return deletedCount;
}

/**
 * Get backup statistics
 */
export async function getBackupStats(): Promise<{
  total: number;
  completed: number;
  failed: number;
  pending: number;
  inProgress: number;
  totalSize: number;
}> {
  const allBackups = await db.select().from(backups);

  return {
    total: allBackups.length,
    completed: allBackups.filter(b => b.status === 'completed').length,
    failed: allBackups.filter(b => b.status === 'failed').length,
    pending: allBackups.filter(b => b.status === 'pending').length,
    inProgress: allBackups.filter(b => b.status === 'in_progress').length,
    totalSize: allBackups.reduce((sum, b) => sum + (b.size || 0), 0),
  };
}
