/**
 * Task Data Layer — lib/db/tasks.ts
 *
 * What it does: Provides CRUD operations for task (to-do) records in the
 *   database. Tasks track work items with a status workflow and optional
 *   links to a campaign, content piece, or artifact deliverable.
 *
 * What it reads from: The tasks table (via Prisma).
 *
 * What it produces: Task records, optionally filtered by status or campaign.
 *
 * Edge cases:
 *   - Task not found during update/delete: Prisma throws P2025 (record not found).
 *   - Approval-gate status transitions: not enforced at data layer (validated
 *     in the API route and MCP tools, which know the caller's role).
 */

import { prisma } from '@/lib/db';
import type { TaskStatus, TaskPriority, TaskCreator } from '@/types';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface TaskFilters {
  status?: TaskStatus;
  campaignId?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string;
  assignee?: string;
  createdBy?: TaskCreator;
  campaignId?: string;
  contentPieceId?: string;
  artifactId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  assignee?: string | null;
  campaignId?: string | null;
  contentPieceId?: string | null;
  artifactId?: string | null;
}

// -------------------------------------------------------------------------
// Read
// -------------------------------------------------------------------------

export async function getTasks(filters?: TaskFilters) {
  return prisma.task.findMany({
    where: {
      status: filters?.status,
      campaignId: filters?.campaignId,
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getTask(id: string) {
  return prisma.task.findUnique({
    where: { id },
  });
}

// -------------------------------------------------------------------------
// Write
// -------------------------------------------------------------------------

export async function createTask(input: CreateTaskInput) {
  return prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      status: input.status ?? 'todo',
      priority: input.priority ?? 'medium',
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      assignee: input.assignee,
      createdBy: input.createdBy ?? 'human',
      campaignId: input.campaignId,
      contentPieceId: input.contentPieceId,
      artifactId: input.artifactId,
    },
  });
}

export async function updateTask(id: string, input: UpdateTaskInput) {
  const updateData: Record<string, unknown> = {};

  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.dueDate !== undefined) {
    updateData.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }
  if (input.assignee !== undefined) updateData.assignee = input.assignee;
  if (input.campaignId !== undefined) updateData.campaignId = input.campaignId;
  if (input.contentPieceId !== undefined) updateData.contentPieceId = input.contentPieceId;
  if (input.artifactId !== undefined) updateData.artifactId = input.artifactId;

  return prisma.task.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteTask(id: string) {
  return prisma.task.delete({
    where: { id },
  });
}
