'use client';

// Client component: app shell with persistent sidebar navigation,
// header with context indicator, and user menu.

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface AppShellProps {
  user: { name: string; role: string };
  contextVersion: number | null;
  pendingProposals: number;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: '◻' },
  { label: 'Sessions', href: '/sessions', icon: '◎' },
  { label: 'Artifacts', href: '/artifacts', icon: '◈' },
  { label: 'Campaigns', href: '/campaigns', icon: '◇' },
  { label: 'Context', href: '/context', icon: '◉' },
  { label: 'Performance', href: '/performance', icon: '◊' },
];

export function AppShell({ user, contextVersion, pendingProposals, children }: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          isSidebarOpen ? 'w-56' : 'w-0 overflow-hidden'
        } flex-shrink-0 border-r bg-muted/30 transition-all duration-200`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 items-center border-b px-4">
            <a href="/dashboard" className="text-lg font-bold tracking-tight">
              Quiver
            </a>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-2">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
                {item.label === 'Context' && pendingProposals > 0 && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    {pendingProposals}
                  </Badge>
                )}
              </a>
            ))}
          </nav>

          {/* User */}
          <div className="border-t p-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.role}</p>
              </div>
            </div>
            <div className="mt-2">
              <a href="/settings" className="text-xs text-muted-foreground hover:text-foreground">
                Settings
              </a>
              <span className="mx-2 text-muted-foreground">·</span>
              <form action="/api/auth/logout" method="POST" className="inline">
                <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="h-8 w-8"
          >
            <span className="text-lg">{isSidebarOpen ? '◁' : '▷'}</span>
          </Button>

          <div className="flex items-center gap-3">
            {contextVersion !== null && (
              <a href="/context" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Context v{contextVersion}
                {pendingProposals > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {pendingProposals} pending
                  </Badge>
                )}
              </a>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
