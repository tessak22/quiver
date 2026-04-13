/**
 * Notifications Data Layer — lib/db/notifications.ts
 *
 * What it does: CRUD operations for in-app notifications and per-member
 *   notification preferences. Notifications are created by system events
 *   (pattern report generated, context proposal created, artifact goes live)
 *   and displayed in the NotificationBell header component.
 *
 * What it reads from: The notifications table and the notificationPrefs JSON
 *   column on TeamMember (via Prisma).
 *
 * What it produces: Notification records and preference objects.
 *
 * Edge cases:
 *   - notificationPrefs defaults to {} (empty object). Missing keys are treated
 *     as true (opt-out model — all types are enabled by default).
 *   - markNotificationRead uses updateMany scoped to memberId so a member can
 *     never mark another member's notification as read.
 *   - createNotificationsForAllMembers is a fan-out: it queries all members
 *     and creates one notification per member who has the type enabled.
 */

import { prisma } from '@/lib/db';
import type { NotificationPrefs, NotificationType } from '@/types';

// -------------------------------------------------------------------------
// Read helpers
// -------------------------------------------------------------------------

export function isNotificationTypeEnabled(
  prefs: NotificationPrefs,
  type: NotificationType
): boolean {
  const value = prefs[type];
  // undefined means not set — default is enabled (opt-out model)
  return value !== false;
}

export async function getUserNotifications(
  memberId: string,
  options?: { limit?: number }
) {
  return prisma.notification.findMany({
    where: { memberId },
    orderBy: { createdAt: 'desc' },
    take: options?.limit ?? 30,
  });
}

export async function getUnreadCount(memberId: string): Promise<number> {
  return prisma.notification.count({
    where: { memberId, isRead: false },
  });
}

export async function getNotificationPrefs(memberId: string): Promise<NotificationPrefs> {
  const member = await prisma.teamMember.findUnique({
    where: { id: memberId },
    select: { notificationPrefs: true },
  });

  if (!member) return {};
  return (member.notificationPrefs ?? {}) as NotificationPrefs;
}

// -------------------------------------------------------------------------
// Write helpers
// -------------------------------------------------------------------------

export async function createNotification(data: {
  memberId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl?: string;
}) {
  return prisma.notification.create({
    data: {
      memberId: data.memberId,
      type: data.type,
      title: data.title,
      body: data.body,
      linkUrl: data.linkUrl,
    },
  });
}

export async function createNotificationsForAllMembers(data: {
  type: NotificationType;
  title: string;
  body: string;
  linkUrl?: string;
}): Promise<void> {
  const members = await prisma.teamMember.findMany({
    select: { id: true, notificationPrefs: true },
  });

  await Promise.all(
    members
      .filter((m) =>
        isNotificationTypeEnabled(
          (m.notificationPrefs ?? {}) as NotificationPrefs,
          data.type
        )
      )
      .map((m) =>
        prisma.notification.create({
          data: {
            memberId: m.id,
            type: data.type,
            title: data.title,
            body: data.body,
            linkUrl: data.linkUrl,
          },
        })
      )
  );
}

export async function markNotificationRead(
  id: string,
  memberId: string
): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, memberId },
    data: { isRead: true },
  });
}

export async function markAllNotificationsRead(memberId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { memberId, isRead: false },
    data: { isRead: true },
  });
}

export async function updateNotificationPrefs(
  memberId: string,
  updates: NotificationPrefs
): Promise<void> {
  const existing = await getNotificationPrefs(memberId);
  await prisma.teamMember.update({
    where: { id: memberId },
    data: {
      notificationPrefs: { ...existing, ...updates },
    },
  });
}
