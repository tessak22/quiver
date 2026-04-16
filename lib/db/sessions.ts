/**
 * Session Data Layer — lib/db/sessions.ts
 *
 * What it does: Provides CRUD operations for AI session records in the database.
 *   Sessions store the full conversation history, mode, loaded skills, and
 *   metadata for every AI interaction.
 *
 * What it reads from: The sessions table (via Prisma).
 *
 * What it produces: Session records with related campaign and context data.
 *
 * Edge cases:
 *   - Session not found during message append: throws descriptive error.
 *   - Messages field may be non-array in corrupted data: coerced to array.
 */

import { prisma } from '@/lib/db';
import type { SessionMode } from '@/types';

export async function getRecentSessions(limit: number = 5) {
  return prisma.session.findMany({
    where: { isArchived: false },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { title: true, mode: true, updatedAt: true },
  });
}

export async function createSession(data: {
  mode: SessionMode;
  skillsLoaded: string[];
  campaignId?: string;
  contextVersionId: string;
  createdBy: string;
  title?: string;
}) {
  return prisma.session.create({
    data: {
      mode: data.mode,
      skillsLoaded: data.skillsLoaded,
      campaignId: data.campaignId,
      contextVersionId: data.contextVersionId,
      createdBy: data.createdBy,
      title: data.title,
      messages: [],
    },
  });
}

export async function getSession(id: string) {
  return prisma.session.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, name: true } },
      contextVersion: { select: { id: true, version: true } },
    },
  });
}

export async function getSessions(filters?: {
  mode?: SessionMode;
  campaignId?: string;
  /**
   * Three-state archived filter:
   *  - `false` / `undefined` (default): only non-archived sessions
   *  - `true`: only archived sessions (historical `archived=true` UX)
   *  - `null`: include both archived and non-archived (new `includeArchived=true` UX)
   */
  isArchived?: boolean | null;
}) {
  const archivedWhere =
    filters?.isArchived === null ? undefined : (filters?.isArchived ?? false);
  return prisma.session.findMany({
    where: {
      mode: filters?.mode,
      campaignId: filters?.campaignId,
      ...(archivedWhere === undefined ? {} : { isArchived: archivedWhere }),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      campaign: { select: { id: true, name: true } },
    },
  });
}

export async function appendMessage(
  sessionId: string,
  message: { role: 'user' | 'assistant'; content: string; timestamp: string }
) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { messages: true },
  });

  if (!session) throw new Error(`Session not found: ${sessionId}`);

  const messages = Array.isArray(session.messages) ? session.messages : [];

  return prisma.session.update({
    where: { id: sessionId },
    data: {
      messages: [...messages, message],
    },
  });
}

export async function updateSessionTitle(sessionId: string, title: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { title },
  });
}

export async function archiveSession(sessionId: string) {
  return prisma.session.update({
    where: { id: sessionId },
    data: { isArchived: true },
  });
}

// Hard delete — Artifact.sessionId is nullable, so attached artifacts
// survive with sessionId=null via Prisma's default SetNull behavior.
export async function deleteSession(id: string) {
  return prisma.session.delete({ where: { id } });
}
