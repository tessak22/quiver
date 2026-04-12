/**
 * Artifact Data Layer — lib/db/artifacts.ts
 *
 * What it does: Provides CRUD operations for artifact records in the database.
 *   Artifacts are the saved outputs from AI sessions — copy, strategies,
 *   analyses, and other marketing deliverables.
 *
 * What it reads from: The artifacts table (via Prisma), with related campaign,
 *   session, context version, and performance log data.
 *
 * What it produces: Artifact records with optional related entity data.
 *
 * Edge cases:
 *   - Search filter uses case-insensitive matching across title and content.
 *   - Tags default to empty array if not provided.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { REMINDER_PREFIX, ARTIFACT_STATUSES } from '@/types';
import { getValidTransitions } from '@/lib/artifact-transitions';
export { getValidTransitions }; // re-export so existing imports from @/lib/db/artifacts still work
import type { ArtifactStatus, PerformanceSignal } from '@/types';

export async function findArtifactMatchesByTitle(
  titlePartial: string,
  take: number = 5
) {
  return prisma.artifact.findMany({
    where: { title: { contains: titlePartial, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true },
    take,
  });
}

export async function getArtifactCampaignId(artifactId: string) {
  const artifact = await prisma.artifact.findUnique({
    where: { id: artifactId },
    select: { campaignId: true },
  });

  return artifact?.campaignId;
}

export async function getRecentArtifacts(limit: number = 5) {
  return prisma.artifact.findMany({
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { title: true, type: true, status: true },
  });
}

export async function createArtifact(data: {
  title: string;
  type: string;
  content: string;
  skillUsed?: string;
  campaignId: string;
  sessionId?: string;
  contextVersionId?: string;
  tags?: string[];
  createdBy: string;
}) {
  return prisma.artifact.create({
    data: {
      title: data.title,
      type: data.type,
      content: data.content,
      skillUsed: data.skillUsed,
      campaignId: data.campaignId,
      sessionId: data.sessionId,
      contextVersionId: data.contextVersionId,
      tags: data.tags ?? [],
      createdBy: data.createdBy,
    },
  });
}

export async function getArtifact(id: string) {
  return prisma.artifact.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, name: true } },
      session: { select: { id: true, title: true, mode: true } },
      contextVersion: { select: { id: true, version: true } },
      performanceLogs: {
        orderBy: { recordedAt: 'desc' },
        take: 5,
      },
    },
  });
}

export async function getArtifacts(filters?: {
  type?: string;
  campaignId?: string;
  status?: string;
  search?: string;
}) {
  return prisma.artifact.findMany({
    where: {
      type: filters?.type,
      campaignId: filters?.campaignId,
      status: filters?.status,
      ...(filters?.search
        ? {
            OR: [
              { title: { contains: filters.search, mode: 'insensitive' } },
              { content: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      campaign: { select: { id: true, name: true } },
      performanceLogs: {
        orderBy: { recordedAt: 'desc' },
        take: 1,
        select: { whatWorked: true, whatDidnt: true },
      },
    },
  });
}

export async function updateArtifact(
  id: string,
  data: { title?: string; status?: string; tags?: string[]; content?: string }
) {
  return prisma.artifact.update({
    where: { id },
    data,
    include: {
      campaign: { select: { id: true, name: true } },
      session: { select: { id: true, title: true, mode: true } },
      contextVersion: { select: { id: true, version: true } },
      performanceLogs: {
        orderBy: { recordedAt: 'desc' },
        take: 5,
      },
    },
  });
}

export function getPerformanceSignal(artifact: {
  performanceLogs?: Array<{ whatWorked: string | null; whatDidnt: string | null }>;
}): PerformanceSignal {
  if (!artifact.performanceLogs || artifact.performanceLogs.length === 0) return 'no_data';
  const latest = artifact.performanceLogs[0];
  if (latest.whatWorked && !latest.whatDidnt) return 'strong';
  if (latest.whatDidnt && !latest.whatWorked) return 'weak';
  return 'logging';
}


export async function transitionArtifactStatus(
  id: string,
  newStatus: string,
  userId: string
) {
  // Validate newStatus is a recognized artifact status
  if (!ARTIFACT_STATUSES.includes(newStatus as ArtifactStatus)) {
    throw new Error(
      `Invalid status: "${newStatus}". Must be one of: ${ARTIFACT_STATUSES.join(', ')}`
    );
  }

  const artifact = await prisma.artifact.findUnique({ where: { id } });
  if (!artifact) throw new Error('Artifact not found');

  const valid = getValidTransitions(artifact.status);
  if (!valid.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: ${artifact.status} → ${newStatus}. Valid: ${valid.join(', ')}`
    );
  }

  const updated = await prisma.artifact.update({
    where: { id },
    data: { status: newStatus },
  });

  // When artifact goes live, create a close-the-loop reminder 14 days out
  if (newStatus === 'live') {
    const reminderDate = new Date();
    reminderDate.setDate(reminderDate.getDate() + 14);

    await prisma.performanceLog.create({
      data: {
        artifactId: id,
        campaignId: artifact.campaignId,
        logType: 'artifact',
        qualitativeNotes: `${REMINDER_PREFIX} "${artifact.title}" — due ${reminderDate.toISOString().split('T')[0]}`,
        contextUpdateStatus: 'na',
        recordedBy: userId,
        recordedAt: reminderDate,
      },
    });
  }

  return updated;
}

export async function createArtifactVersion(
  parentId: string,
  data: {
    title: string;
    content: string;
    createdBy: string;
    tags?: string[];
  }
) {
  const parent = await prisma.artifact.findUnique({ where: { id: parentId } });
  if (!parent) throw new Error('Parent artifact not found');

  return prisma.artifact.create({
    data: {
      title: data.title,
      type: parent.type,
      content: data.content,
      status: 'draft' satisfies ArtifactStatus,
      skillUsed: parent.skillUsed,
      campaignId: parent.campaignId,
      sessionId: parent.sessionId,
      contextVersionId: parent.contextVersionId,
      version: parent.version + 1,
      parentArtifactId: parentId,
      tags: data.tags ?? parent.tags,
      createdBy: data.createdBy,
    },
  });
}

export async function getArtifactVersions(artifactId: string) {
  type ArtifactRow = Awaited<ReturnType<typeof prisma.artifact.findUniqueOrThrow>>;

  const MAX_DEPTH = 100;

  // Find the root artifact (follow parentArtifactId chain upward)
  const initial = await prisma.artifact.findUnique({ where: { id: artifactId } });
  if (!initial) return [];

  let root: ArtifactRow = initial;
  let upwardDepth = 0;

  while (root.parentArtifactId) {
    if (++upwardDepth > MAX_DEPTH) break;
    const parent = await prisma.artifact.findUnique({
      where: { id: root.parentArtifactId },
    });
    if (!parent) break;
    root = parent;
  }

  // Collect all versions descending from root using set-based breadth-first traversal
  const allVersions: ArtifactRow[] = [root];
  const seenIds = new Set([root.id]);
  let currentIds = [root.id];
  let downwardDepth = 0;

  while (currentIds.length > 0) {
    if (++downwardDepth > MAX_DEPTH) break;
    const children = await prisma.artifact.findMany({
      where: { parentArtifactId: { in: currentIds } },
      orderBy: { version: 'asc' },
    });
    if (children.length === 0) break;
    currentIds = children.filter((c) => !seenIds.has(c.id)).map((c) => c.id);
    children.forEach((c) => {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id);
        allVersions.push(c);
      }
    });
  }

  return allVersions.sort((a, b) => b.version - a.version);
}

// Get close-the-loop reminders (overdue or upcoming)
export async function getReminders() {
  return prisma.performanceLog.findMany({
    where: {
      logType: 'artifact',
      qualitativeNotes: { startsWith: REMINDER_PREFIX },
      metrics: { equals: Prisma.DbNull }, // Not yet logged
    },
    include: {
      artifact: { select: { id: true, title: true, type: true, status: true } },
      campaign: { select: { id: true, name: true } },
    },
    orderBy: { recordedAt: 'asc' },
  });
}
