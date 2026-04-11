/**
 * Performance Data Layer — lib/db/performance.ts
 *
 * What it does: Provides CRUD operations for performance log records.
 *   Performance logs capture results from marketing artifacts and campaigns —
 *   metrics, qualitative notes, what worked, what didn't, and AI-proposed
 *   context updates.
 *
 * What it reads from: The performance_logs table (via Prisma), with related
 *   artifact and campaign data.
 *
 * What it produces: Performance log records with optional related entity data.
 *
 * Edge cases:
 *   - Logs with qualitativeNotes starting with REMINDER_PREFIX are excluded from
 *     standard queries (they are close-the-loop reminders, not real entries).
 *   - proposedContextUpdates defaults contextUpdateStatus to "pending" when
 *     present, "na" otherwise.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { REMINDER_PREFIX } from '@/types';

export async function createPerformanceLog(data: {
  artifactId?: string;
  campaignId: string;
  logType: string;
  metrics?: Record<string, unknown>;
  qualitativeNotes?: string;
  whatWorked?: string;
  whatDidnt?: string;
  proposedContextUpdates?: unknown;
  recordedBy: string;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  return prisma.performanceLog.create({
    data: {
      artifactId: data.artifactId,
      campaignId: data.campaignId,
      logType: data.logType,
      metrics: data.metrics
        ? (data.metrics as Prisma.InputJsonValue)
        : undefined,
      qualitativeNotes: data.qualitativeNotes,
      whatWorked: data.whatWorked,
      whatDidnt: data.whatDidnt,
      proposedContextUpdates: data.proposedContextUpdates
        ? (data.proposedContextUpdates as Prisma.InputJsonValue)
        : undefined,
      contextUpdateStatus: data.proposedContextUpdates ? 'pending' : 'na',
      recordedBy: data.recordedBy,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    },
  });
}

export async function getPerformanceLogs(filters?: {
  artifactId?: string;
  campaignId?: string;
  logType?: string;
}) {
  return prisma.performanceLog.findMany({
    where: {
      artifactId: filters?.artifactId,
      campaignId: filters?.campaignId,
      logType: filters?.logType,
      qualitativeNotes: { not: { startsWith: REMINDER_PREFIX } },
    },
    include: {
      artifact: { select: { id: true, title: true, type: true } },
      campaign: { select: { id: true, name: true } },
    },
    orderBy: { recordedAt: 'desc' },
  });
}

export async function getPerformanceLog(id: string) {
  return prisma.performanceLog.findUnique({
    where: { id },
    include: {
      artifact: { select: { id: true, title: true, type: true } },
      campaign: { select: { id: true, name: true } },
    },
  });
}

export async function updatePerformanceLog(
  id: string,
  data: {
    proposedContextUpdates?: unknown;
    contextUpdateStatus?: string;
  }
) {
  return prisma.performanceLog.update({
    where: { id },
    data: {
      proposedContextUpdates: data.proposedContextUpdates
        ? (data.proposedContextUpdates as Prisma.InputJsonValue)
        : undefined,
      contextUpdateStatus: data.contextUpdateStatus,
    },
  });
}

export async function getRecentPerformanceLogs(days: number = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return prisma.performanceLog.findMany({
    where: {
      recordedAt: { gte: cutoff },
      qualitativeNotes: { not: { startsWith: REMINDER_PREFIX } },
    },
    include: {
      artifact: { select: { title: true, type: true } },
      campaign: { select: { name: true } },
    },
    orderBy: { recordedAt: 'desc' },
  });
}

export async function getPendingProposals() {
  return prisma.performanceLog.findMany({
    where: {
      contextUpdateStatus: 'pending',
      proposedContextUpdates: { not: Prisma.AnyNull },
    },
    include: {
      artifact: { select: { id: true, title: true, type: true } },
      campaign: { select: { id: true, name: true } },
    },
    orderBy: { recordedAt: 'desc' },
  });
}
