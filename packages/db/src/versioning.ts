import { db } from './index';
import { 
  article_branches, 
  branch_commits, 
  merge_history, 
  version_snapshots, 
  version_audit_log,
  articleRevisions,
  articles 
} from './schema';
import { eq, and, desc, asc } from 'drizzle-orm';
import * as Diff from 'diff';

// Types
export interface CreateBranchParams {
  articleId: number;
  name: string;
  description?: string;
  createdBy?: number;
  sourceRevisionId?: number;
}

export interface Branch {
  id: number;
  articleId: number;
  name: string;
  description: string | null;
  parentBranchId: number | null;
  sourceRevisionId: number | null;
  createdBy: number | null;
  status: 'active' | 'merged' | 'abandoned';
  headRevisionId: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  mergedAt: Date | null;
  abandonedAt: Date | null;
}

export interface MergeParams {
  articleId: number;
  sourceBranchId: number;
  targetBranchId: number;
  mergedBy?: number;
  mergeMessage?: string;
}

export interface ConflictResolution {
  field: string;
  resolution: 'ours' | 'theirs' | 'manual';
  value?: string;
}

export interface MergeResult {
  success: boolean;
  hasConflicts: boolean;
  conflicts?: Array<{
    field: string;
    sourceValue: string;
    targetValue: string;
  }>;
  mergeId?: number;
}

export interface VersionSnapshot {
  id: number;
  articleId: number;
  revisionId: number;
  snapshotData: {
    title: string;
    content: string;
    excerpt?: string;
    categoryId?: number;
    tags: string[];
    metadata?: Record<string, unknown>;
  };
  snapshotType: 'auto' | 'manual' | 'pre_merge' | 'post_merge';
  createdBy: number | null;
  createdAt: Date | null;
}

// Branch Management

export async function createBranch(params: CreateBranchParams): Promise<Branch> {
  const [branch] = await db.insert(article_branches).values({
    articleId: params.articleId,
    name: params.name,
    description: params.description || null,
    createdBy: params.createdBy || null,
    sourceRevisionId: params.sourceRevisionId || null,
    status: 'active',
    headRevisionId: params.sourceRevisionId || null,
  }).returning();

  // Log the action
  await logVersionAction({
    articleId: params.articleId,
    action: 'branch_created',
    performedBy: params.createdBy,
    branchId: branch.id,
    details: { branchName: params.name }
  });

  return branch;
}

export async function getBranch(branchId: number): Promise<Branch | null> {
  const [branch] = await db.select()
    .from(article_branches)
    .where(eq(article_branches.id, branchId))
    .limit(1);
  
  return branch || null;
}

export async function getBranchesByArticle(articleId: number): Promise<Branch[]> {
  return await db.select()
    .from(article_branches)
    .where(eq(article_branches.articleId, articleId))
    .orderBy(desc(article_branches.createdAt));
}

export async function abandonBranch(branchId: number, userId?: number): Promise<void> {
  const branch = await getBranch(branchId);
  if (!branch) throw new Error('Branch not found');

  await db.update(article_branches)
    .set({ 
      status: 'abandoned', 
      abandonedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(article_branches.id, branchId));

  await logVersionAction({
    articleId: branch.articleId,
    action: 'branch_abandoned',
    performedBy: userId,
    branchId: branchId,
    details: { branchName: branch.name }
  });
}

// Commit Management

export async function createCommit(params: {
  branchId: number;
  revisionId: number;
  commitMessage?: string;
  createdBy?: number;
}): Promise<void> {
  const branch = await getBranch(params.branchId);
  if (!branch) throw new Error('Branch not found');

  // Create the commit record
  await db.insert(branch_commits).values({
    branchId: params.branchId,
    revisionId: params.revisionId,
    commitMessage: params.commitMessage || null,
    createdBy: params.createdBy || null,
  });

  // Update branch head
  await db.update(article_branches)
    .set({ 
      headRevisionId: params.revisionId,
      updatedAt: new Date()
    })
    .where(eq(article_branches.id, params.branchId));

  await logVersionAction({
    articleId: branch.articleId,
    action: 'commit_created',
    performedBy: params.createdBy,
    branchId: params.branchId,
    revisionId: params.revisionId,
    details: { commitMessage: params.commitMessage }
  });
}

export async function getBranchCommits(branchId: number): Promise<Array<{
  id: number;
  revisionId: number;
  commitMessage: string | null;
  createdBy: number | null;
  createdAt: Date | null;
}>> {
  return await db.select()
    .from(branch_commits)
    .where(eq(branch_commits.branchId, branchId))
    .orderBy(desc(branch_commits.createdAt));
}

// Merge Operations

export async function detectMergeConflicts(
  sourceBranch: Branch,
  targetBranch: Branch
): Promise<Array<{ field: string; sourceValue: string; targetValue: string }>> {
  const conflicts: Array<{ field: string; sourceValue: string; targetValue: string }> = [];

  if (!sourceBranch.headRevisionId || !targetBranch.headRevisionId) {
    return conflicts;
  }

  // Get the revisions
  const [sourceRevision] = await db.select()
    .from(articleRevisions)
    .where(eq(articleRevisions.id, sourceBranch.headRevisionId))
    .limit(1);

  const [targetRevision] = await db.select()
    .from(articleRevisions)
    .where(eq(articleRevisions.id, targetBranch.headRevisionId))
    .limit(1);

  if (!sourceRevision || !targetRevision) {
    return conflicts;
  }

  // Check for conflicts in key fields
  if (sourceRevision.title !== targetRevision.title) {
    conflicts.push({
      field: 'title',
      sourceValue: sourceRevision.title,
      targetValue: targetRevision.title
    });
  }

  if (sourceRevision.content !== targetRevision.content) {
    conflicts.push({
      field: 'content',
      sourceValue: sourceRevision.content,
      targetValue: targetRevision.content
    });
  }

  if (sourceRevision.excerpt !== targetRevision.excerpt) {
    conflicts.push({
      field: 'excerpt',
      sourceValue: sourceRevision.excerpt || '',
      targetValue: targetRevision.excerpt || ''
    });
  }

  return conflicts;
}

export async function mergeBranches(params: MergeParams): Promise<MergeResult> {
  const sourceBranch = await getBranch(params.sourceBranchId);
  const targetBranch = await getBranch(params.targetBranchId);

  if (!sourceBranch || !targetBranch) {
    throw new Error('Source or target branch not found');
  }

  if (sourceBranch.articleId !== targetBranch.articleId) {
    throw new Error('Cannot merge branches from different articles');
  }

  // Detect conflicts
  const conflicts = await detectMergeConflicts(sourceBranch, targetBranch);
  const hasConflicts = conflicts.length > 0;

  // Create merge history record
  const [mergeRecord] = await db.insert(merge_history).values({
    articleId: params.articleId,
    sourceBranchId: params.sourceBranchId,
    targetBranchId: params.targetBranchId,
    mergedBy: params.mergedBy || null,
    mergeMessage: params.mergeMessage || null,
    hasConflicts,
    status: hasConflicts ? 'pending' : 'completed',
  }).returning();

  await logVersionAction({
    articleId: params.articleId,
    action: 'merge_initiated',
    performedBy: params.mergedBy,
    mergeId: mergeRecord.id,
    details: { 
      sourceBranch: sourceBranch.name, 
      targetBranch: targetBranch.name,
      hasConflicts 
    }
  });

  if (hasConflicts) {
    await logVersionAction({
      articleId: params.articleId,
      action: 'merge_conflict_detected',
      performedBy: params.mergedBy,
      mergeId: mergeRecord.id,
      details: { conflicts }
    });

    return {
      success: false,
      hasConflicts: true,
      conflicts,
      mergeId: mergeRecord.id
    };
  }

  // Perform the merge (update article with source branch content)
  if (sourceBranch.headRevisionId) {
    const [sourceRevision] = await db.select()
      .from(articleRevisions)
      .where(eq(articleRevisions.id, sourceBranch.headRevisionId))
      .limit(1);

    if (sourceRevision) {
      await db.update(articles)
        .set({
          title: sourceRevision.title,
          content: sourceRevision.content,
          excerpt: sourceRevision.excerpt,
          categoryId: sourceRevision.categoryId,
          tags: sourceRevision.tags,
          updatedAt: new Date()
        })
        .where(eq(articles.id, params.articleId));

      // Update target branch head
      await db.update(article_branches)
        .set({ 
          headRevisionId: sourceBranch.headRevisionId,
          updatedAt: new Date()
        })
        .where(eq(article_branches.id, params.targetBranchId));

      // Mark source branch as merged
      await db.update(article_branches)
        .set({ 
          status: 'merged', 
          mergedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(article_branches.id, params.sourceBranchId));
    }
  }

  await logVersionAction({
    articleId: params.articleId,
    action: 'merge_completed',
    performedBy: params.mergedBy,
    mergeId: mergeRecord.id,
    details: { 
      sourceBranch: sourceBranch.name, 
      targetBranch: targetBranch.name 
    }
  });

  return {
    success: true,
    hasConflicts: false,
    mergeId: mergeRecord.id
  };
}

export async function resolveMergeConflicts(
  mergeId: number,
  resolutions: ConflictResolution[],
  resolvedBy?: number
): Promise<void> {
  const [mergeRecord] = await db.select()
    .from(merge_history)
    .where(eq(merge_history.id, mergeId))
    .limit(1);

  if (!mergeRecord) {
    throw new Error('Merge record not found');
  }

  // Apply resolutions
  const sourceBranch = await getBranch(mergeRecord.sourceBranchId);
  const targetBranch = await getBranch(mergeRecord.targetBranchId);

  if (!sourceBranch || !targetBranch || !sourceBranch.headRevisionId || !targetBranch.headRevisionId) {
    throw new Error('Branch information incomplete');
  }

  const [sourceRevision] = await db.select()
    .from(articleRevisions)
    .where(eq(articleRevisions.id, sourceBranch.headRevisionId))
    .limit(1);

  const [targetRevision] = await db.select()
    .from(articleRevisions)
    .where(eq(articleRevisions.id, targetBranch.headRevisionId))
    .limit(1);

  if (!sourceRevision || !targetRevision) {
    throw new Error('Revision information incomplete');
  }

  // Build resolved article state
  const resolvedData: any = {};
  
  for (const resolution of resolutions) {
    if (resolution.resolution === 'ours') {
      resolvedData[resolution.field] = (sourceRevision as any)[resolution.field];
    } else if (resolution.resolution === 'theirs') {
      resolvedData[resolution.field] = (targetRevision as any)[resolution.field];
    } else if (resolution.resolution === 'manual' && resolution.value !== undefined) {
      resolvedData[resolution.field] = resolution.value;
    }
  }

  // Update article with resolved data
  await db.update(articles)
    .set({
      ...resolvedData,
      updatedAt: new Date()
    })
    .where(eq(articles.id, mergeRecord.articleId));

  // Update merge record
  await db.update(merge_history)
    .set({
      conflictResolution: resolutions,
      status: 'completed'
    })
    .where(eq(merge_history.id, mergeId));

  await logVersionAction({
    articleId: mergeRecord.articleId,
    action: 'merge_conflict_resolved',
    performedBy: resolvedBy,
    mergeId: mergeId,
    details: { resolutions }
  });
}

// Version Snapshots

export async function createSnapshot(params: {
  articleId: number;
  revisionId: number;
  snapshotType: 'auto' | 'manual' | 'pre_merge' | 'post_merge';
  createdBy?: number;
}): Promise<VersionSnapshot> {
  // Get the article and revision data
  const [article] = await db.select()
    .from(articles)
    .where(eq(articles.id, params.articleId))
    .limit(1);

  const [revision] = await db.select()
    .from(articleRevisions)
    .where(eq(articleRevisions.id, params.revisionId))
    .limit(1);

  if (!article || !revision) {
    throw new Error('Article or revision not found');
  }

  const [snapshot] = await db.insert(version_snapshots).values({
    articleId: params.articleId,
    revisionId: params.revisionId,
    snapshotData: {
      title: revision.title,
      content: revision.content,
      excerpt: revision.excerpt || undefined,
      categoryId: revision.categoryId || undefined,
      tags: revision.tags || [],
      metadata: {
        originalArticleId: article.id,
        originalSlug: article.slug
      }
    },
    snapshotType: params.snapshotType,
    createdBy: params.createdBy || null,
  }).returning();

  await logVersionAction({
    articleId: params.articleId,
    action: 'snapshot_created',
    performedBy: params.createdBy,
    revisionId: params.revisionId,
    details: { snapshotType: params.snapshotType }
  });

  return snapshot;
}

export async function getSnapshots(articleId: number): Promise<VersionSnapshot[]> {
  return await db.select()
    .from(version_snapshots)
    .where(eq(version_snapshots.articleId, articleId))
    .orderBy(desc(version_snapshots.createdAt));
}

export async function restoreSnapshot(
  snapshotId: number, 
  restoredBy?: number
): Promise<void> {
  const [snapshot] = await db.select()
    .from(version_snapshots)
    .where(eq(version_snapshots.id, snapshotId))
    .limit(1);

  if (!snapshot) {
    throw new Error('Snapshot not found');
  }

  // Restore article state from snapshot
  await db.update(articles)
    .set({
      title: snapshot.snapshotData.title,
      content: snapshot.snapshotData.content,
      excerpt: snapshot.snapshotData.excerpt || null,
      categoryId: snapshot.snapshotData.categoryId || null,
      tags: snapshot.snapshotData.tags,
      updatedAt: new Date()
    })
    .where(eq(articles.id, snapshot.articleId));

  await logVersionAction({
    articleId: snapshot.articleId,
    action: 'version_restored',
    performedBy: restoredBy,
    revisionId: snapshot.revisionId,
    details: { snapshotId, snapshotType: snapshot.snapshotType }
  });
}

// Audit Logging

export async function logVersionAction(params: {
  articleId: number;
  action: string;
  performedBy?: number;
  branchId?: number;
  revisionId?: number;
  mergeId?: number;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  await db.insert(version_audit_log).values({
    articleId: params.articleId,
    action: params.action as any,
    performedBy: params.performedBy || null,
    branchId: params.branchId || null,
    revisionId: params.revisionId || null,
    mergeId: params.mergeId || null,
    details: params.details || null,
    ipAddress: params.ipAddress || null,
    userAgent: params.userAgent || null,
  });
}

export async function getVersionAuditLog(articleId: number): Promise<Array<{
  id: number;
  action: string;
  performedBy: number | null;
  branchId: number | null;
  revisionId: number | null;
  mergeId: number | null;
  details: Record<string, unknown> | null;
  createdAt: Date | null;
}>> {
  return await db.select()
    .from(version_audit_log)
    .where(eq(version_audit_log.articleId, articleId))
    .orderBy(desc(version_audit_log.createdAt));
}

// Branch Tree Visualization

export async function getBranchTree(articleId: number): Promise<{
  branches: Branch[];
  tree: Map<number, number[]>; // parentBranchId -> childBranchIds
}> {
  const branches = await getBranchesByArticle(articleId);
  
  const tree = new Map<number, number[]>();
  branches.forEach(branch => {
    if (branch.parentBranchId) {
      const children = tree.get(branch.parentBranchId) || [];
      children.push(branch.id);
      tree.set(branch.parentBranchId, children);
    }
  });

  return { branches, tree };
}
