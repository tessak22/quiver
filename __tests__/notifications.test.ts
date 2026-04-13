/**
 * Tests for lib/db/notifications.ts
 *
 * What this tests: Notification CRUD and preference helpers with mocked Prisma.
 *   - createNotification: creates a record for a single member
 *   - createNotificationsForAllMembers: fans out to members with the type enabled
 *   - getUserNotifications: returns notifications ordered by creation date
 *   - markNotificationRead: updates a single notification
 *   - markAllNotificationsRead: bulk marks read for a member
 *   - getUnreadCount: counts unread for a member
 *   - getNotificationPrefs: reads and parses prefs JSON
 *   - updateNotificationPrefs: merges new prefs onto existing
 *   - isNotificationTypeEnabled: reads the opt-out flag with correct defaults
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    teamMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  createNotification,
  createNotificationsForAllMembers,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,
  getNotificationPrefs,
  updateNotificationPrefs,
  isNotificationTypeEnabled,
} from '@/lib/db/notifications';

const SAMPLE_NOTIFICATION = {
  id: 'notif-1',
  memberId: 'member-1',
  type: 'pattern_report',
  title: 'Monthly Pattern Report',
  body: 'Your April 2026 pattern report is ready.',
  linkUrl: '/artifacts',
  isRead: false,
  createdAt: new Date('2026-04-01'),
};

describe('createNotification', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls prisma.notification.create with correct data', async () => {
    vi.mocked(prisma.notification.create).mockResolvedValue(SAMPLE_NOTIFICATION as never);

    await createNotification({
      memberId: 'member-1',
      type: 'pattern_report',
      title: 'Monthly Pattern Report',
      body: 'Your April 2026 pattern report is ready.',
      linkUrl: '/artifacts',
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        memberId: 'member-1',
        type: 'pattern_report',
        title: 'Monthly Pattern Report',
        body: 'Your April 2026 pattern report is ready.',
        linkUrl: '/artifacts',
      },
    });
  });

  it('works without linkUrl', async () => {
    vi.mocked(prisma.notification.create).mockResolvedValue(SAMPLE_NOTIFICATION as never);

    await createNotification({
      memberId: 'member-1',
      type: 'context_proposal',
      title: 'New Proposal',
      body: 'A context update proposal is awaiting review.',
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        memberId: 'member-1',
        type: 'context_proposal',
        title: 'New Proposal',
        body: 'A context update proposal is awaiting review.',
        linkUrl: undefined,
      },
    });
  });
});

describe('createNotificationsForAllMembers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a notification for each member with the type enabled', async () => {
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
      { id: 'member-1', notificationPrefs: {} },
      { id: 'member-2', notificationPrefs: { pattern_report: true } },
      { id: 'member-3', notificationPrefs: { pattern_report: false } },
    ] as never);
    vi.mocked(prisma.notification.create).mockResolvedValue(SAMPLE_NOTIFICATION as never);

    await createNotificationsForAllMembers({
      type: 'pattern_report',
      title: 'Monthly Pattern Report',
      body: 'Ready.',
      linkUrl: '/artifacts',
    });

    // member-1 and member-2 have type enabled (default true / explicit true)
    // member-3 opted out
    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });

  it('skips members who have opted out', async () => {
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
      { id: 'member-1', notificationPrefs: { context_proposal: false } },
    ] as never);

    await createNotificationsForAllMembers({
      type: 'context_proposal',
      title: 'New Proposal',
      body: 'Review it.',
    });

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('creates for all members when all have default empty prefs', async () => {
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
      { id: 'm1', notificationPrefs: {} },
      { id: 'm2', notificationPrefs: {} },
    ] as never);
    vi.mocked(prisma.notification.create).mockResolvedValue(SAMPLE_NOTIFICATION as never);

    await createNotificationsForAllMembers({
      type: 'artifact_live',
      title: 'Artifact is live',
      body: 'Time to log results.',
    });

    expect(prisma.notification.create).toHaveBeenCalledTimes(2);
  });
});

describe('getUserNotifications', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries by memberId ordered by createdAt desc', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([]);

    await getUserNotifications('member-1');

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: { memberId: 'member-1' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  });

  it('accepts a custom limit', async () => {
    vi.mocked(prisma.notification.findMany).mockResolvedValue([]);

    await getUserNotifications('member-1', { limit: 10 });

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 })
    );
  });
});

describe('markNotificationRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses updateMany scoped to memberId for safety', async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 1 });

    await markNotificationRead('notif-1', 'member-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notif-1', memberId: 'member-1' },
      data: { isRead: true },
    });
  });
});

describe('markAllNotificationsRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marks all unread notifications for a member as read', async () => {
    vi.mocked(prisma.notification.updateMany).mockResolvedValue({ count: 5 });

    await markAllNotificationsRead('member-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { memberId: 'member-1', isRead: false },
      data: { isRead: true },
    });
  });
});

describe('getUnreadCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counts unread notifications for member', async () => {
    vi.mocked(prisma.notification.count).mockResolvedValue(3);

    const count = await getUnreadCount('member-1');

    expect(count).toBe(3);
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { memberId: 'member-1', isRead: false },
    });
  });
});

describe('getNotificationPrefs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns parsed prefs from teamMember record', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      notificationPrefs: { pattern_report: false },
    } as never);

    const prefs = await getNotificationPrefs('member-1');

    expect(prefs).toEqual({ pattern_report: false });
  });

  it('returns empty object when member not found', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null);

    const prefs = await getNotificationPrefs('member-999');

    expect(prefs).toEqual({});
  });
});

describe('updateNotificationPrefs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges new prefs over existing prefs', async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
      notificationPrefs: { pattern_report: true, context_proposal: true },
    } as never);
    vi.mocked(prisma.teamMember.update).mockResolvedValue({} as never);

    await updateNotificationPrefs('member-1', { context_proposal: false });

    expect(prisma.teamMember.update).toHaveBeenCalledWith({
      where: { id: 'member-1' },
      data: {
        notificationPrefs: {
          pattern_report: true,
          context_proposal: false,
        },
      },
    });
  });
});

describe('isNotificationTypeEnabled', () => {
  it('returns true when prefs is empty (default on)', () => {
    expect(isNotificationTypeEnabled({}, 'pattern_report')).toBe(true);
  });

  it('returns true when type is explicitly true', () => {
    expect(isNotificationTypeEnabled({ context_proposal: true }, 'context_proposal')).toBe(true);
  });

  it('returns false when type is explicitly false', () => {
    expect(isNotificationTypeEnabled({ artifact_live: false }, 'artifact_live')).toBe(false);
  });

  it('returns true for one type even if another is disabled', () => {
    expect(isNotificationTypeEnabled({ pattern_report: false }, 'context_proposal')).toBe(true);
  });
});
