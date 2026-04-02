import { db } from '@aidepedia/db';
import { 
  collaboration_sessions, 
  section_locks, 
  collaboration_edits, 
  edit_conflicts,
  users 
} from '@aidepedia/db/schema';
import { eq, and, gt, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export interface User {
  id: number;
  name: string | null;
  email: string;
  image: string | null;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface Collaborator {
  user: User;
  sessionId: string;
  cursorPosition?: CursorPosition;
  currentSection?: string;
  lastActivity: Date;
}

export interface SectionLock {
  sectionName: string;
  userId: number;
  user: User;
  lockedAt: Date;
  expiresAt: Date;
}

export interface EditOperation {
  type: 'insert' | 'delete' | 'replace';
  position: { start: number; end: number };
  oldValue?: string;
  newValue?: string;
  sectionName?: string;
}

export interface ConflictResolution {
  resolution: 'auto_merged' | 'manual_merge' | 'last_write_wins';
  resolvedValue: string;
}

/**
 * Collaboration Service
 * Handles real-time collaboration features including presence tracking,
 * section locking, conflict resolution, and edit history
 */
export class CollaborationService {
  private static instance: CollaborationService;
  private activeConnections = new Map<string, WebSocket[]>();
  
  static getInstance(): CollaborationService {
    if (!CollaborationService.instance) {
      CollaborationService.instance = new CollaborationService();
    }
    return CollaborationService.instance;
  }

  /**
   * Join a collaboration session
   */
  async joinSession(articleId: number, userId: number): Promise<string> {
    const sessionId = randomUUID();
    
    // Deactivate any existing sessions for this user on this article
    await db
      .update(collaboration_sessions)
      .set({ isActive: false })
      .where(and(
        eq(collaboration_sessions.articleId, articleId),
        eq(collaboration_sessions.userId, userId),
        eq(collaboration_sessions.isActive, true)
      ));
    
    // Create new session
    await db.insert(collaboration_sessions).values({
      articleId,
      userId,
      sessionId,
      isActive: true,
      lastActivity: new Date(),
    });
    
    return sessionId;
  }

  /**
   * Leave a collaboration session
   */
  async leaveSession(sessionId: string): Promise<void> {
    await db
      .update(collaboration_sessions)
      .set({ isActive: false })
      .where(eq(collaboration_sessions.sessionId, sessionId));
    
    // Release any locks held by this session
    await db
      .delete(section_locks)
      .where(eq(section_locks.sessionId, sessionId));
  }

  /**
   * Update user presence (cursor position, current section)
   */
  async updatePresence(
    sessionId: string,
    cursorPosition?: CursorPosition,
    currentSection?: string
  ): Promise<void> {
    await db
      .update(collaboration_sessions)
      .set({
        cursorPosition,
        currentSection,
        lastActivity: new Date(),
      })
      .where(eq(collaboration_sessions.sessionId, sessionId));
  }

  /**
   * Get all active collaborators for an article
   */
  async getActiveCollaborators(articleId: number): Promise<Collaborator[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const sessions = await db
      .select({
        sessionId: collaboration_sessions.sessionId,
        cursorPosition: collaboration_sessions.cursorPosition,
        currentSection: collaboration_sessions.currentSection,
        lastActivity: collaboration_sessions.lastActivity,
        user: users,
      })
      .from(collaboration_sessions)
      .innerJoin(users, eq(collaboration_sessions.userId, users.id))
      .where(and(
        eq(collaboration_sessions.articleId, articleId),
        eq(collaboration_sessions.isActive, true),
        gt(collaboration_sessions.lastActivity, fiveMinutesAgo)
      ));
    
    return sessions.map(session => ({
      sessionId: session.sessionId,
      cursorPosition: session.cursorPosition as CursorPosition | undefined,
      currentSection: session.currentSection || undefined,
      lastActivity: session.lastActivity,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      },
    }));
  }

  /**
   * Lock a section for exclusive editing
   */
  async lockSection(
    articleId: number,
    sectionName: string,
    userId: number,
    sessionId: string,
    durationMinutes: number = 5
  ): Promise<{ success: boolean; lock?: SectionLock; error?: string }> {
    // Check if section is already locked
    const existingLock = await db
      .select()
      .from(section_locks)
      .where(and(
        eq(section_locks.articleId, articleId),
        eq(section_locks.sectionName, sectionName),
        gt(section_locks.expiresAt, new Date())
      ))
      .limit(1);
    
    if (existingLock.length > 0 && existingLock[0].userId !== userId) {
      // Get lock holder info
      const [lockHolder] = await db
        .select()
        .from(users)
        .where(eq(users.id, existingLock[0].userId))
        .limit(1);
      
      return {
        success: false,
        error: `Section is locked by ${lockHolder?.name || 'another user'}`,
      };
    }
    
    // If user already has the lock, extend it
    if (existingLock.length > 0 && existingLock[0].userId === userId) {
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
      await db
        .update(section_locks)
        .set({ expiresAt })
        .where(eq(section_locks.id, existingLock[0].id));
      
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      return {
        success: true,
        lock: {
          sectionName,
          userId,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          },
          lockedAt: existingLock[0].lockedAt,
          expiresAt,
        },
      };
    }
    
    // Create new lock
    const lockedAt = new Date();
    const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
    
    await db.insert(section_locks).values({
      articleId,
      sectionName,
      userId,
      sessionId,
      lockedAt,
      expiresAt,
    });
    
    // Record lock edit
    await db.insert(collaboration_edits).values({
      articleId,
      userId,
      sessionId,
      editType: 'section_lock',
      sectionName,
      createdAt: new Date(),
    });
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    
    return {
      success: true,
      lock: {
        sectionName,
        userId,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
        lockedAt,
        expiresAt,
      },
    };
  }

  /**
   * Unlock a section
   */
  async unlockSection(
    articleId: number,
    sectionName: string,
    userId: number,
    sessionId: string
  ): Promise<void> {
    await db
      .delete(section_locks)
      .where(and(
        eq(section_locks.articleId, articleId),
        eq(section_locks.sectionName, sectionName),
        eq(section_locks.userId, userId)
      ));
    
    // Record unlock edit
    await db.insert(collaboration_edits).values({
      articleId,
      userId,
      sessionId,
      editType: 'section_unlock',
      sectionName,
      createdAt: new Date(),
    });
  }

  /**
   * Get all active locks for an article
   */
  async getActiveLocks(articleId: number): Promise<SectionLock[]> {
    const locks = await db
      .select({
        sectionName: section_locks.sectionName,
        userId: section_locks.userId,
        lockedAt: section_locks.lockedAt,
        expiresAt: section_locks.expiresAt,
        user: users,
      })
      .from(section_locks)
      .innerJoin(users, eq(section_locks.userId, users.id))
      .where(and(
        eq(section_locks.articleId, articleId),
        gt(section_locks.expiresAt, new Date())
      ));
    
    return locks.map(lock => ({
      sectionName: lock.sectionName,
      userId: lock.userId,
      user: {
        id: lock.user.id,
        name: lock.user.name,
        email: lock.user.email,
        image: lock.user.image,
      },
      lockedAt: lock.lockedAt,
      expiresAt: lock.expiresAt,
    }));
  }

  /**
   * Record an edit operation
   */
  async recordEdit(
    articleId: number,
    userId: number,
    sessionId: string,
    operation: EditOperation
  ): Promise<void> {
    const editTypeMap = {
      'insert': 'text_insert',
      'delete': 'text_delete',
      'replace': 'text_replace',
    } as const;
    
    await db.insert(collaboration_edits).values({
      articleId,
      userId,
      sessionId,
      editType: editTypeMap[operation.type],
      sectionName: operation.sectionName,
      position: operation.position,
      oldValue: operation.oldValue,
      newValue: operation.newValue,
      createdAt: new Date(),
    });
  }

  /**
   * Get collaboration history for an article
   */
  async getCollaborationHistory(
    articleId: number,
    limit: number = 50,
    userId?: number
  ): Promise<Array<{
    id: number;
    user: User;
    editType: string;
    sectionName?: string;
    createdAt: Date;
  }>> {
    const conditions = [eq(collaboration_edits.articleId, articleId)];
    
    if (userId) {
      conditions.push(eq(collaboration_edits.userId, userId));
    }
    
    const edits = await db
      .select({
        id: collaboration_edits.id,
        editType: collaboration_edits.editType,
        sectionName: collaboration_edits.sectionName,
        createdAt: collaboration_edits.createdAt,
        user: users,
      })
      .from(collaboration_edits)
      .innerJoin(users, eq(collaboration_edits.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(collaboration_edits.createdAt))
      .limit(limit);
    
    return edits.map(edit => ({
      id: edit.id,
      editType: edit.editType,
      sectionName: edit.sectionName || undefined,
      createdAt: edit.createdAt,
      user: {
        id: edit.user.id,
        name: edit.user.name,
        email: edit.user.email,
        image: edit.user.image,
      },
    }));
  }

  /**
   * Resolve edit conflicts using operational transformation
   */
  async resolveConflict(
    articleId: number,
    sectionName: string,
    originalEdit: EditOperation,
    conflictingEdit: EditOperation,
    originalUserId: number,
    conflictingUserId: number
  ): Promise<ConflictResolution> {
    // Try auto-merge for non-overlapping edits
    if (this.canAutoMerge(originalEdit, conflictingEdit)) {
      const mergedValue = this.mergeEdits(originalEdit, conflictingEdit);
      
      // Record conflict
      await db.insert(edit_conflicts).values({
        articleId,
        sectionName,
        conflictingUserId,
        conflictingEdit: conflictingEdit as any,
        originalUserId,
        originalEdit: originalEdit as any,
        resolution: 'auto_merged',
        resolvedValue: mergedValue,
        resolvedAt: new Date(),
      });
      
      return {
        resolution: 'auto_merged',
        resolvedValue: mergedValue,
      };
    }
    
    // Last write wins for conflicting edits
    const resolvedValue = conflictingEdit.newValue || '';
    
    await db.insert(edit_conflicts).values({
      articleId,
      sectionName,
      conflictingUserId,
      conflictingEdit: conflictingEdit as any,
      originalUserId,
      originalEdit: originalEdit as any,
      resolution: 'last_write_wins',
      resolvedValue,
      resolvedAt: new Date(),
    });
    
    return {
      resolution: 'last_write_wins',
      resolvedValue,
    };
  }

  /**
   * Check if two edits can be auto-merged
   */
  private canAutoMerge(edit1: EditOperation, edit2: EditOperation): boolean {
    // Non-overlapping positions can be merged
    if (edit1.position.end < edit2.position.start || 
        edit2.position.end < edit1.position.start) {
      return true;
    }
    
    // Same position insertions can be merged
    if (edit1.type === 'insert' && edit2.type === 'insert' &&
        edit1.position.start === edit2.position.start) {
      return true;
    }
    
    return false;
  }

  /**
   * Merge two compatible edits
   */
  private mergeEdits(edit1: EditOperation, edit2: EditOperation): string {
    // Simple merge: concatenate non-overlapping inserts
    if (edit1.type === 'insert' && edit2.type === 'insert') {
      if (edit1.position.start <= edit2.position.start) {
        return (edit1.newValue || '') + (edit2.newValue || '');
      } else {
        return (edit2.newValue || '') + (edit1.newValue || '');
      }
    }
    
    // Default: use second edit's value
    return edit2.newValue || edit1.newValue || '';
  }

  /**
   * Clean up expired sessions and locks
   */
  async cleanupExpired(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Deactivate expired sessions
    await db
      .update(collaboration_sessions)
      .set({ isActive: false })
      .where(and(
        eq(collaboration_sessions.isActive, true),
        gt(new Date(), fiveMinutesAgo)
      ));
    
    // Delete expired locks
    await db
      .delete(section_locks)
      .where(gt(new Date(), section_locks.expiresAt));
  }
}

// Export singleton instance
export const collaborationService = CollaborationService.getInstance();
