/**
 * Campaign Data Layer — lib/db/campaigns.ts
 *
 * What it does: Provides CRUD operations for campaign records in the database.
 *   Campaigns organize marketing efforts with status workflows, channels,
 *   related sessions, artifacts, and performance logs.
 *
 * What it reads from: The campaigns table (via Prisma), with aggregated counts
 *   from sessions, artifacts, and performance_logs.
 *
 * What it produces: Campaign records with optional relation counts for display.
 *
 * Edge cases:
 *   - Campaign not found during update/archive: Prisma throws P2025 (record not found).
 *   - Invalid status transitions: not enforced at data layer (validated in API route).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { DEFAULT_CAMPAIGN_NAME } from '@/types';
import type { CampaignStatus, CampaignPriority } from '@/types';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface CampaignFilters {
  status?: CampaignStatus;
}

export interface CampaignLink {
  label: string;
  url: string;
}

interface CreateCampaignInput {
  name: string;
  description?: string;
  goal?: string;
  channels?: string[];
  status?: CampaignStatus;
  priority?: CampaignPriority;
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  links?: CampaignLink[];
}

interface UpdateCampaignInput {
  name?: string;
  description?: string;
  goal?: string;
  channels?: string[];
  status?: CampaignStatus;
  priority?: CampaignPriority;
  startDate?: string | null;
  endDate?: string | null;
  ownerId?: string | null;
  links?: CampaignLink[];
}

// -------------------------------------------------------------------------
// Default campaign lookup
// -------------------------------------------------------------------------

export async function getDefaultCampaign() {
  return prisma.campaign.findFirst({
    where: { name: DEFAULT_CAMPAIGN_NAME },
  });
}

export async function countCampaignsByStatus(status: CampaignStatus) {
  return prisma.campaign.count({
    where: { status },
  });
}

export async function findCampaignMatchesByName(name: string, take: number = 5) {
  return prisma.campaign.findMany({
    where: {
      name: { contains: name, mode: 'insensitive' },
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: { updatedAt: 'desc' },
    take,
  });
}

// -------------------------------------------------------------------------
// Read
// -------------------------------------------------------------------------

export async function getCampaigns(filters?: CampaignFilters) {
  return prisma.campaign.findMany({
    where: {
      status: filters?.status,
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: {
        select: {
          sessions: true,
          artifacts: true,
          performanceLogs: true,
          contentPieces: true,
        },
      },
    },
  });
}

export async function getCampaign(id: string) {
  return prisma.campaign.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          sessions: true,
          artifacts: true,
          performanceLogs: true,
          contentPieces: true,
        },
      },
    },
  });
}

// -------------------------------------------------------------------------
// Write
// -------------------------------------------------------------------------

export async function createCampaign(data: CreateCampaignInput) {
  return prisma.campaign.create({
    data: {
      name: data.name,
      description: data.description,
      goal: data.goal,
      channels: data.channels ?? [],
      status: data.status ?? 'planning',
      priority: data.priority ?? 'medium',
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      ownerId: data.ownerId,
      links: data.links
        ? (data.links as unknown as Prisma.InputJsonValue)
        : undefined,
    },
    include: {
      _count: {
        select: {
          sessions: true,
          artifacts: true,
          performanceLogs: true,
        },
      },
    },
  });
}

export async function updateCampaign(id: string, data: UpdateCampaignInput) {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.goal !== undefined) updateData.goal = data.goal;
  if (data.channels !== undefined) updateData.channels = data.channels;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.startDate !== undefined) {
    updateData.startDate = data.startDate ? new Date(data.startDate) : null;
  }
  if (data.endDate !== undefined) {
    updateData.endDate = data.endDate ? new Date(data.endDate) : null;
  }
  if (data.ownerId !== undefined) updateData.ownerId = data.ownerId;
  if (data.links !== undefined) {
    updateData.links = data.links as unknown as Prisma.InputJsonValue;
  }

  return prisma.campaign.update({
    where: { id },
    data: updateData,
    include: {
      _count: {
        select: {
          sessions: true,
          artifacts: true,
          performanceLogs: true,
        },
      },
    },
  });
}

export async function archiveCampaign(id: string) {
  return prisma.campaign.update({
    where: { id },
    data: { status: 'archived' },
    include: {
      _count: {
        select: {
          sessions: true,
          artifacts: true,
          performanceLogs: true,
        },
      },
    },
  });
}

// -------------------------------------------------------------------------
// Related data for detail tabs
// -------------------------------------------------------------------------

export async function getCampaignSessions(campaignId: string) {
  return prisma.session.findMany({
    where: { campaignId, isArchived: false },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      mode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getCampaignArtifacts(campaignId: string) {
  return prisma.artifact.findMany({
    where: { campaignId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getCampaignPerformanceLogs(campaignId: string) {
  return prisma.performanceLog.findMany({
    where: { campaignId },
    orderBy: { recordedAt: 'desc' },
    select: {
      id: true,
      logType: true,
      qualitativeNotes: true,
      whatWorked: true,
      whatDidnt: true,
      recordedAt: true,
      periodStart: true,
      periodEnd: true,
    },
  });
}
