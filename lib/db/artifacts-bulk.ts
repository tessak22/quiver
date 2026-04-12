/**
 * lib/db/artifacts-bulk.ts
 *
 * What it does: Executes bulk operations on artifacts — status changes,
 *   campaign reassignment, tag modification, and archiving.
 *
 * What it reads from: prisma.artifact, prisma.campaign, prisma.performanceLog
 * What it produces: BulkOperationResult with succeeded/failed/skipped ID lists.
 *
 * Edge cases:
 *   - IDs not found in the database are reported as `failed` (not skipped).
 *   - Status transitions respect the state machine via partitionByValidTransition.
 *   - Moving to "live" creates a 14-day close-the-loop reminder per artifact,
 *     mirroring the behavior of transitionArtifactStatus in artifacts.ts.
 *   - Tag add/remove is idempotent — already-present tags are a no-op.
 *   - MAX_TAGS_PER_ARTIFACT (20) is enforced on add; excess tags are dropped.
 *   - Callers (API route) must enforce MAX_BULK_IDS before calling these functions.
 */

import { prisma } from '@/lib/db';
import { getValidTransitions } from '@/lib/artifact-transitions';
import { REMINDER_PREFIX } from '@/types';
import type { ArtifactStatus, BulkOperationResult } from '@/types';

export const MAX_BULK_IDS = 100;
export const MAX_TAG_LENGTH = 50;
export const MAX_TAGS_PER_ARTIFACT = 20;

// ---------------------------------------------------------------------------
// Pure helpers (testable without a database)
// ---------------------------------------------------------------------------

export function partitionByValidTransition(
  artifacts: Array<{ id: string; status: string }>,
  targetStatus: string
): {
  eligible: Array<{ id: string; status: string }>;
  skipped: Array<{ id: string; reason: string }>;
} {
  const eligible: Array<{ id: string; status: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const artifact of artifacts) {
    if (artifact.status === targetStatus) {
      skipped.push({ id: artifact.id, reason: `Already in status: ${targetStatus}` });
    } else if (!getValidTransitions(artifact.status).includes(targetStatus)) {
      skipped.push({
        id: artifact.id,
        reason: `Invalid transition: ${artifact.status} → ${targetStatus}`,
      });
    } else {
      eligible.push(artifact);
    }
  }

  return { eligible, skipped };
}

/**
 * Trim, deduplicate, truncate, and filter a raw tag array from JSON input.
 * Accepts unknown[] because it is called directly with unvalidated body values.
 */
export function normalizeBulkTags(tags: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const trimmed = tag.trim().slice(0, MAX_TAG_LENGTH);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal: resolve IDs, detect missing ones
// ---------------------------------------------------------------------------

type ResolvedArtifact = {
  id: string;
  status: string;
  tags: string[];
  campaignId: string;
  title: string;
};

async function resolveArtifacts(ids: string[]): Promise<{
  found: ResolvedArtifact[];
  missing: string[];
}> {
  const found = await prisma.artifact.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, tags: true, campaignId: true, title: true },
  });
  const foundIds = new Set(found.map((a) => a.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  return { found, missing };
}

// ---------------------------------------------------------------------------
// Bulk DB operations
// ---------------------------------------------------------------------------

export async function bulkStatusChange(
  ids: string[],
  targetStatus: ArtifactStatus,
  userId: string
): Promise<BulkOperationResult> {
  const { found, missing } = await resolveArtifacts(ids);
  const foundMap = new Map(found.map((a) => [a.id, a]));
  const { eligible, skipped } = partitionByValidTransition(found, targetStatus);

  const failed: Array<{ id: string; reason: string }> = missing.map((id) => ({
    id,
    reason: 'Artifact not found',
  }));
  const succeeded: string[] = [];

  for (const artifact of eligible) {
    try {
      await prisma.artifact.update({
        where: { id: artifact.id },
        data: { status: targetStatus },
      });

      // Moving to "live" creates a 14-day close-the-loop performance reminder
      if (targetStatus === 'live') {
        const full = foundMap.get(artifact.id)!;
        const reminderDate = new Date();
        reminderDate.setDate(reminderDate.getDate() + 14);

        await prisma.performanceLog.create({
          data: {
            artifactId: artifact.id,
            campaignId: full.campaignId,
            logType: 'artifact',
            qualitativeNotes: `${REMINDER_PREFIX} "${full.title}" — due ${
              reminderDate.toISOString().split('T')[0]
            }`,
            contextUpdateStatus: 'na',
            recordedBy: userId,
            recordedAt: reminderDate,
          },
        });
      }

      succeeded.push(artifact.id);
    } catch {
      failed.push({ id: artifact.id, reason: 'Database error' });
    }
  }

  return { succeeded, failed, skipped };
}

export async function bulkCampaignReassign(
  ids: string[],
  campaignId: string
): Promise<BulkOperationResult> {
  const { found, missing } = await resolveArtifacts(ids);

  const failed: Array<{ id: string; reason: string }> = missing.map((id) => ({
    id,
    reason: 'Artifact not found',
  }));

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) {
    return {
      succeeded: [],
      failed: [
        ...failed,
        ...found.map((a) => ({ id: a.id, reason: 'Target campaign not found' })),
      ],
      skipped: [],
    };
  }

  const succeeded: string[] = [];

  for (const artifact of found) {
    try {
      await prisma.artifact.update({
        where: { id: artifact.id },
        data: { campaignId },
      });
      succeeded.push(artifact.id);
    } catch {
      failed.push({ id: artifact.id, reason: 'Database error' });
    }
  }

  return { succeeded, failed, skipped: [] };
}

export async function bulkAddTags(
  ids: string[],
  tagsToAdd: string[]
): Promise<BulkOperationResult> {
  const { found, missing } = await resolveArtifacts(ids);

  const failed: Array<{ id: string; reason: string }> = missing.map((id) => ({
    id,
    reason: 'Artifact not found',
  }));
  const succeeded: string[] = [];

  for (const artifact of found) {
    try {
      const existing = new Set(artifact.tags);
      const merged = [...artifact.tags];
      for (const tag of tagsToAdd) {
        if (!existing.has(tag) && merged.length < MAX_TAGS_PER_ARTIFACT) {
          merged.push(tag);
          existing.add(tag);
        }
      }
      await prisma.artifact.update({
        where: { id: artifact.id },
        data: { tags: merged },
      });
      succeeded.push(artifact.id);
    } catch {
      failed.push({ id: artifact.id, reason: 'Database error' });
    }
  }

  return { succeeded, failed, skipped: [] };
}

export async function bulkRemoveTags(
  ids: string[],
  tagsToRemove: string[]
): Promise<BulkOperationResult> {
  const removeSet = new Set(tagsToRemove);
  const { found, missing } = await resolveArtifacts(ids);

  const failed: Array<{ id: string; reason: string }> = missing.map((id) => ({
    id,
    reason: 'Artifact not found',
  }));
  const succeeded: string[] = [];

  for (const artifact of found) {
    try {
      const updated = artifact.tags.filter((t) => !removeSet.has(t));
      await prisma.artifact.update({
        where: { id: artifact.id },
        data: { tags: updated },
      });
      succeeded.push(artifact.id);
    } catch {
      failed.push({ id: artifact.id, reason: 'Database error' });
    }
  }

  return { succeeded, failed, skipped: [] };
}

/** Bulk archive — shorthand for bulkStatusChange to 'archived'. Only 'live' artifacts can archive in one step. */
export async function bulkArchive(
  ids: string[],
  userId: string
): Promise<BulkOperationResult> {
  return bulkStatusChange(ids, 'archived', userId);
}
