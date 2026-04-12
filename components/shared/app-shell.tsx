'use client';

// Client component: app shell with persistent sidebar navigation,
// header with context indicator, and user menu.

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  MessageSquare,
  FileText,
  FolderKanban,
  FlaskConical,
  BookOpen,
  BarChart3,
  FileEdit,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  LogOut,
} from 'lucide-react';
import { ThemeToggle } from '@/components/shared/theme-toggle';

interface AppShellProps {
  user: { name: string; role: string };
  contextVersion: number | null;
  pendingProposals: number;
  children: ReactNode;
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Sessions', href: '/sessions', icon: MessageSquare },
  { label: 'Artifacts', href: '/artifacts', icon: FileText },
  { label: 'Campaigns', href: '/campaigns', icon: FolderKanban },
  { label: 'Research', href: '/research', icon: FlaskConical },
  { label: 'Content', href: '/content', icon: FileEdit },
  { label: 'Context', href: '/context', icon: BookOpen },
  { label: 'Performance', href: '/performance', icon: BarChart3 },
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
            <Link href="/dashboard" className="text-lg font-bold tracking-tight">
              Quiver
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive(item.href)
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  {item.label === 'Context' && pendingProposals > 0 && (
                    <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                      {pendingProposals}
                    </Badge>
                  )}
                </Link>
              );
            })}
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
            <div className="mt-2 flex items-center gap-3">
              <Link href="/settings" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Settings className="h-3 w-3" />
                Settings
              </Link>
              <form action="/api/auth/logout" method="POST" className="inline">
                <button type="submit" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <LogOut className="h-3 w-3" />
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
            {isSidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>

          <div className="flex items-center gap-3">
            {contextVersion !== null && (
              <Link href="/context" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Context v{contextVersion}
                {pendingProposals > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0">
                    {pendingProposals} pending
                  </Badge>
                )}
              </Link>
            )}
            <ThemeToggle />
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
