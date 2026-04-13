'use client';

// NotificationBell — header component that shows unread notification count
// and a dropdown list of recent notifications. Marks items read on open
// and supports "mark all read" action.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = (await res.json()) as { notifications: Notification[] };
      setNotifications(data.notifications);
    } catch {
      // Non-critical — silently fail
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // When the popover opens, mark all unread notifications as read
  async function handleOpen(isOpen: boolean) {
    setOpen(isOpen);
    if (isOpen && unreadCount > 0) {
      try {
        await fetch('/api/notifications/read-all', { method: 'POST' });
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      } catch {
        // Non-fatal
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
        </div>
        <Separator />

        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No notifications yet.
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id}>
                {n.linkUrl ? (
                  <Link
                    href={n.linkUrl}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-3 text-sm hover:bg-muted/50"
                  >
                    <NotificationItem notification={n} />
                  </Link>
                ) : (
                  <div className="px-4 py-3 text-sm">
                    <NotificationItem notification={n} />
                  </div>
                )}
                <Separator />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({ notification: n }: { notification: Notification }) {
  return (
    <>
      <p className={`font-medium leading-snug ${n.isRead ? 'text-foreground/70' : 'text-foreground'}`}>
        {n.title}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{n.body}</p>
      <p className="mt-1 text-[11px] text-muted-foreground/60">{formatDate(n.createdAt)}</p>
    </>
  );
}
