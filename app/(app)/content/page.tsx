// 'use client' — required for useState, useEffect, useCallback, and user interactions
// (filter controls, tab switching, calendar navigation)
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import type {
  ContentType,
  ContentStatus,
  PerformanceSignal,
} from '@/types';
import {
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  CONTENT_STATUSES,
} from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentRecord {
  id: string;
  title: string;
  slug: string;
  contentType: string;
  status: string;
  targetKeyword: string | null;
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
  campaign: { id: string; name: string } | null;
  distributionCount: number;
  performanceSignal: PerformanceSignal;
}

interface CampaignOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Draft',
  review: 'Review',
  approved: 'Approved',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_COLORS: Record<ContentStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  review: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  published: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const TYPE_BADGE_COLORS: Record<ContentType, string> = {
  blog_post: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  case_study: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  landing_page: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  changelog: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  newsletter: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  social_thread: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  video_script: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  doc: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const SIGNAL_DOT: Record<PerformanceSignal, string> = {
  no_data: 'bg-gray-400',
  logging: 'bg-amber-400',
  strong: 'bg-green-500',
  weak: 'bg-red-500',
};

const SIGNAL_LABEL: Record<PerformanceSignal, string> = {
  no_data: 'No performance data',
  logging: 'Performance logging',
  strong: 'Strong performance',
  weak: 'Weak performance',
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days: Array<{ day: number; date: string } | null> = [];

  // Leading empty cells
  for (let i = 0; i < startDow; i++) {
    days.push(null);
  }

  // Month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, date: dateStr });
  }

  return days;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContentLibraryPage() {
  const [content, setContent] = useState<ContentRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<ContentType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');

  // Calendar state
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  // Fetch campaigns for filter dropdown
  useEffect(() => {
    async function fetchCampaigns() {
      try {
        const res = await fetch('/api/campaigns');
        if (res.ok) {
          const data = await res.json() as { campaigns: CampaignOption[] };
          setCampaigns(data.campaigns);
        }
      } catch {
        // Campaign filter is non-critical; silently fail
      }
    }
    fetchCampaigns();
  }, []);

  // Fetch content
  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('contentType', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (campaignFilter !== 'all') params.set('campaignId', campaignFilter);

      const res = await fetch(`/api/content?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to load content');
      }

      const data = await res.json() as { contentPieces: ContentRecord[] };
      setContent(data.contentPieces);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, campaignFilter]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // Calendar navigation
  function prevMonth() {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  }

  // Calendar data — group content by published date
  const calendarDays = getCalendarDays(calYear, calMonth);
  const publishedByDate = new Map<string, ContentRecord[]>();
  const unscheduled: ContentRecord[] = [];

  for (const piece of content) {
    if (piece.publishedAt) {
      const date = piece.publishedAt.split('T')[0];
      const existing = publishedByDate.get(date) ?? [];
      existing.push(piece);
      publishedByDate.set(date, existing);
    } else {
      unscheduled.push(piece);
    }
  }

  // Drafts — filter for draft/review
  const drafts = content.filter(
    (p) => p.status === 'draft' || p.status === 'review'
  );

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your content library — blog posts, case studies, and more.
          </p>
        </div>
        <Button asChild>
          <Link href="/content/new">+ New</Link>
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

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
        </TabsList>

        {/* ------- All tab ------- */}
        <TabsContent value="all" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={typeFilter}
              onValueChange={(value) => setTypeFilter(value as ContentType | 'all')}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {CONTENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CONTENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as ContentStatus | 'all')}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {CONTENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {campaigns.length > 0 && (
              <Select
                value={campaignFilter}
                onValueChange={setCampaignFilter}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All campaigns</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center min-h-[200px]">
              <p className="text-muted-foreground">Loading content...</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && content.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-lg font-medium">No content yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Create your first content piece to start building your content library.
                </p>
                <Button asChild className="mt-4">
                  <Link href="/content/new">Create content</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Card grid */}
          {!loading && content.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {content.map((piece) => {
                const ct = piece.contentType as ContentType;
                const cs = piece.status as ContentStatus;

                return (
                  <Link
                    key={piece.id}
                    href={`/content/${piece.id}`}
                    className="block"
                  >
                    <Card className="transition-colors hover:bg-muted/50 h-full">
                      <CardContent className="p-5 flex flex-col gap-3 h-full">
                        {/* Top row: type badge + performance signal */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE_COLORS[ct] ?? TYPE_BADGE_COLORS.other}`}
                          >
                            {CONTENT_TYPE_LABELS[ct] ?? piece.contentType}
                          </span>
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${SIGNAL_DOT[piece.performanceSignal]}`}
                            title={SIGNAL_LABEL[piece.performanceSignal]}
                          />
                        </div>

                        {/* Title */}
                        <p className="font-medium leading-snug line-clamp-2">
                          {piece.title}
                        </p>

                        {/* Target keyword */}
                        {piece.targetKeyword && (
                          <p className="text-xs text-muted-foreground truncate">
                            {piece.targetKeyword}
                          </p>
                        )}

                        {/* Bottom row: status + date + distribution count */}
                        <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[cs] ?? ''}`}
                          >
                            {STATUS_LABELS[cs] ?? piece.status}
                          </span>
                          <div className="flex items-center gap-2">
                            {piece.distributionCount > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {piece.distributionCount} dist.
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {piece.publishedAt
                                ? formatDate(piece.publishedAt)
                                : formatDate(piece.createdAt)}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ------- Calendar tab ------- */}
        <TabsContent value="calendar" className="space-y-4 mt-4">
          {loading && (
            <div className="flex items-center justify-center min-h-[200px]">
              <p className="text-muted-foreground">Loading content...</p>
            </div>
          )}

          {!loading && (
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Calendar grid */}
              <div className="flex-1">
                {/* Navigation */}
                <div className="flex items-center justify-between mb-4">
                  <Button variant="outline" size="sm" onClick={prevMonth}>
                    Prev
                  </Button>
                  <h2 className="text-lg font-semibold">
                    {MONTH_NAMES[calMonth]} {calYear}
                  </h2>
                  <Button variant="outline" size="sm" onClick={nextMonth}>
                    Next
                  </Button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 gap-px mb-1">
                  {DAY_NAMES.map((d) => (
                    <div
                      key={d}
                      className="text-center text-xs font-medium text-muted-foreground py-2"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden">
                  {calendarDays.map((cell, idx) => (
                    <div
                      key={idx}
                      className="bg-background min-h-[80px] p-1"
                    >
                      {cell && (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {cell.day}
                          </span>
                          <div className="space-y-0.5 mt-0.5">
                            {(publishedByDate.get(cell.date) ?? []).map((p) => {
                              const ct = p.contentType as ContentType;
                              return (
                                <Link
                                  key={p.id}
                                  href={`/content/${p.id}`}
                                  className={`block rounded px-1 py-0.5 text-[10px] leading-tight truncate ${TYPE_BADGE_COLORS[ct] ?? TYPE_BADGE_COLORS.other}`}
                                  title={p.title}
                                >
                                  {p.title}
                                </Link>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Unscheduled sidebar */}
              <div className="w-full lg:w-64 shrink-0">
                <h3 className="text-sm font-semibold mb-3">Unscheduled</h3>
                {unscheduled.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    All content is scheduled.
                  </p>
                )}
                <div className="space-y-2">
                  {unscheduled.map((p) => {
                    const ct = p.contentType as ContentType;
                    return (
                      <Link
                        key={p.id}
                        href={`/content/${p.id}`}
                        className="block"
                      >
                        <Card className="transition-colors hover:bg-muted/50">
                          <CardContent className="p-3">
                            <span
                              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium mb-1 ${TYPE_BADGE_COLORS[ct] ?? TYPE_BADGE_COLORS.other}`}
                            >
                              {CONTENT_TYPE_LABELS[ct] ?? p.contentType}
                            </span>
                            <p className="text-sm font-medium line-clamp-1">
                              {p.title}
                            </p>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ------- Drafts tab ------- */}
        <TabsContent value="drafts" className="space-y-4 mt-4">
          {loading && (
            <div className="flex items-center justify-center min-h-[200px]">
              <p className="text-muted-foreground">Loading drafts...</p>
            </div>
          )}

          {!loading && drafts.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-lg font-medium">No drafts</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  All your content is either published or archived.
                </p>
              </CardContent>
            </Card>
          )}

          {!loading && drafts.length > 0 && (
            <div className="space-y-2">
              {drafts.map((piece) => {
                const ct = piece.contentType as ContentType;
                const cs = piece.status as ContentStatus;

                return (
                  <Link
                    key={piece.id}
                    href={`/content/${piece.id}`}
                    className="block"
                  >
                    <Card className="transition-colors hover:bg-muted/50">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${TYPE_BADGE_COLORS[ct] ?? TYPE_BADGE_COLORS.other}`}
                          >
                            {CONTENT_TYPE_LABELS[ct] ?? piece.contentType}
                          </span>
                          <p className="font-medium truncate">{piece.title}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[cs] ?? ''}`}
                          >
                            {STATUS_LABELS[cs] ?? piece.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(piece.updatedAt)}
                          </span>
                          <span className="text-xs text-blue-600 dark:text-blue-400">
                            Continue editing
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
