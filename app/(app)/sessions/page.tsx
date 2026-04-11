'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SessionMode } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionRecord {
  id: string;
  title: string | null;
  mode: string;
  skillsLoaded: string[];
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  campaign: { id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MODE_LABELS: Record<SessionMode, string> = {
  strategy: 'Strategy',
  create: 'Create',
  feedback: 'Feedback',
  analyze: 'Analyze',
  optimize: 'Optimize',
};

const MODE_COLORS: Record<SessionMode, string> = {
  strategy: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  create: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  feedback: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  analyze: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  optimize: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};

const ALL_MODES: SessionMode[] = ['strategy', 'create', 'feedback', 'analyze', 'optimize'];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SessionsListPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [modeFilter, setModeFilter] = useState<SessionMode | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (modeFilter !== 'all') params.set('mode', modeFilter);
      if (showArchived) params.set('archived', 'true');

      const res = await fetch(`/api/sessions?${params.toString()}`);
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to load sessions');
      }

      const data: { sessions: SessionRecord[] } = await res.json();
      setSessions(data.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [modeFilter, showArchived]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your AI marketing sessions.
          </p>
        </div>
        <Button asChild>
          <Link href="/sessions/new">New Session</Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Mode:</span>
          <Select
            value={modeFilter}
            onValueChange={(value) =>
              setModeFilter(value as SessionMode | 'all')
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modes</SelectItem>
              {ALL_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant={showArchived ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowArchived((prev) => !prev)}
        >
          {showArchived ? 'Showing archived' : 'Show archived'}
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-muted-foreground">Loading sessions...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && sessions.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-lg font-medium">No sessions yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {showArchived
                ? 'No archived sessions found.'
                : 'Start a new AI marketing session to get strategic recommendations, create content, analyze data, or optimize your copy.'}
            </p>
            {!showArchived && (
              <Button asChild className="mt-4">
                <Link href="/sessions/new">Start your first session</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Session list */}
      {!loading && sessions.length > 0 && (
        <div className="space-y-2">
          {sessions.map((session) => {
            const mode = session.mode as SessionMode;
            return (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="block"
              >
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center justify-between gap-4 py-4 px-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            MODE_COLORS[mode] ?? ''
                          }`}
                        >
                          {MODE_LABELS[mode] ?? mode}
                        </span>
                        {session.campaign && (
                          <Badge variant="outline" className="text-xs">
                            {session.campaign.name}
                          </Badge>
                        )}
                        {session.isArchived && (
                          <Badge variant="secondary" className="text-xs">
                            Archived
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 font-medium truncate">
                        {session.title ?? 'Untitled session'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Last updated {formatDate(session.updatedAt)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" tabIndex={-1}>
                      Resume
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
