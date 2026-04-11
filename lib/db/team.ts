/**
 * Team Data Layer — lib/db/team.ts
 *
 * What it does: Provides CRUD operations for team member records in the database.
 *   Team members are users with roles (admin, member, viewer) who have access
 *   to the Quiver workspace.
 *
 * What it reads from: The team_members table (via Prisma).
 *
 * What it produces: Team member records for authentication checks, role management,
 *   and team listings.
 *
 * Edge cases:
 *   - Cannot demote or remove the last admin — callers must check admin count first.
 *   - acceptInvite creates a new member only if one doesn't already exist.
 */

import { prisma } from '@/lib/db';
import type { TeamRole } from '@/types';

export async function getTeamMembers() {
  return prisma.teamMember.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTeamMember(id: string) {
  return prisma.teamMember.findUnique({
    where: { id },
  });
}

export async function getTeamMemberRole(id: string) {
  return prisma.teamMember.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
}

export async function createTeamMember(data: {
  id: string;
  name: string;
  email: string;
  role?: TeamRole;
}) {
  return prisma.teamMember.create({
    data: {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role ?? 'member',
    },
  });
}

export async function updateTeamMemberRole(id: string, role: TeamRole) {
  return prisma.teamMember.update({
    where: { id },
    data: { role },
  });
}

export async function deleteTeamMember(id: string) {
  return prisma.teamMember.delete({
    where: { id },
  });
}

export async function getAdminCount() {
  return prisma.teamMember.count({
    where: { role: 'admin' },
  });
}

export async function getTeamMemberCount() {
  return prisma.teamMember.count();
}
