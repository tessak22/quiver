'use client';
// 'use client' — uses hooks (useState, useEffect, useCallback, useRef) for filter
//   state, data fetching, and bulk selection; cannot be a Server Component

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ArtifactType, ArtifactStatus, PerformanceSignal } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkActionBar } from '@/components/artifacts/bulk-action-bar';
import { BulkConfirmDialog } from '@/components/artifacts/bulk-confirm-dialog';
import { getValidTransitions } from '@/lib/artifact-transitions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArtifactRecord {
  id: string;
  title: string;
  type: string;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  campaign: { id: string; name: string } | null;
  performanceLogs: Array<{
    whatWorked: string | null;
    whatDidnt: string | null;
  }>;
}

interface CampaignOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  copywriting: 'Copywriting',
  email_sequence: 'Email Sequence',
  cold_email: 'Cold Email',
  social_content: 'Social Content',
  launch_strategy: 'Launch Strategy',
  content_strategy: 'Content Strategy',
  positioning: 'Positioning',
  messaging: 'Messaging',
  ad_creative: 'Ad Creative',
  competitor_analysis: 'Competitor Analysis',
  seo: 'SEO',
  cro: 'CRO',
  ab_test: 'A/B Test',
  landing_page: 'Landing Page',
  one_pager: 'One Pager',
  other: 'Other',
};

const ALL_TYPES: ArtifactType[] = [
  'copywriting',
  'email_sequence',
  'cold_email',
  'social_content',
  'launch_strategy',
  'content_strategy',
  'positioning',
  'messaging',
  'ad_creative',
  'competitor_analysis',
  'seo',
  'cro',
  'ab_test',
  'landing_page',
  'one_pager',
  'other',
];

const STATUS_LABELS: Record<ArtifactStatus, string> = {
  draft: 'Draft',
  review: 'Review',
  approved: 'Approved',
  live: 'Live',
  archived: 'Archived',
};

const STATUS_COLORS: Record<ArtifactStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  review: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  live: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const ALL_STATUSES: ArtifactStatus[] = ['draft', 'review', 'approved', 'live', 'archived'];

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeSignal(
  logs: Array<{ whatWorked: string | null; whatDidnt: string | null }>
): PerformanceSignal {
  if (!logs || logs.length === 0) return 'no_data';
  const latest = logs[0];
  if (latest.whatWorked && !latest.whatDidnt) return 'strong';
  if (latest.whatDidnt && !latest.whatWorked) return 'weak';
  return 'logging';
}

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ArtifactsLibraryPage() {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<ArtifactType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ArtifactStatus | 'all'>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bulk selection state (issue #41)
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulk, setPendingBulk] = useState<{
    action: 'status_change' | 'campaign_reassign' | 'add_tags' | 'remove_tags' | 'archive';
    params: Record<string, unknown>;
    actionLabel: string;
    skipped: Array<{ id: string; reason: string }>;
    // IDs snapshot from dialog-open time — only those visible and analyzed,
    // not the full selectedIds set which may include filter-invisible artifacts
    actionableIds: string[];
  } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

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

  // Fetch artifacts
  const fetchArtifacts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (campaignFilter !== 'all') params.set('campaignId', campaignFilter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const res = await fetch(`/api/artifacts?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to load artifacts');
      }

      const data = await res.json() as { artifacts: ArtifactRecord[] };
      setArtifacts(data.artifacts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifacts');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, campaignFilter, debouncedSearch]);

  useEffect(() => {
    fetchArtifacts();
  }, [fetchArtifacts]);

  // Bulk selection handlers (issue #41)

  function handleSelectAll() {
    setSelectedIds(new Set(artifacts.map((a) => a.id)));
  }

  function handleDeselectAll() {
    setSelectedIds(new Set());
  }

  function handleExitSelectMode() {
    setIsSelecting(false);
    setSelectedIds(new Set());
    setBulkError(null);
  }

  const handleToggleSelection = useCallback((artifactId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(artifactId)) next.delete(artifactId);
      else next.add(artifactId);
      return next;
    });
  }, []);

  function handleRequestAction(
    action: 'status_change' | 'campaign_reassign' | 'add_tags' | 'remove_tags' | 'archive',
    params: Record<string, unknown>
  ) {
    const selected = artifacts.filter((a) => selectedIds.has(a.id));
    let skipped: Array<{ id: string; reason: string }> = [];

    if (action === 'status_change' || action === 'archive') {
      const targetStatus =
        action === 'archive' ? 'archived' : (params.targetStatus as string);
      skipped = selected
        .filter(
          (a) =>
            a.status === targetStatus ||
            !getValidTransitions(a.status).includes(targetStatus)
        )
        .map((a) => ({
          id: a.id,
          reason:
            a.status === targetStatus
              ? `"${a.title}" is already ${targetStatus}`
              : `"${a.title}": ${a.status} → ${targetStatus} is not a valid transition`,
        }));
    }

    const actionLabel =
      action === 'status_change'
        ? `Change Status to ${params.targetStatus as string}`
        : action === 'campaign_reassign'
        ? 'Reassign Campaign'
        : action === 'add_tags'
        ? 'Add Tags'
        : action === 'remove_tags'
        ? 'Remove Tags'
        : 'Archive';

    setPendingBulk({ action, params, actionLabel, skipped, actionableIds: selected.map((a) => a.id) });
  }

  async function handleBulkConfirm() {
    if (!pendingBulk) return;
    setBulkLoading(true);
    setBulkError(null);

    const { action, params, actionableIds } = pendingBulk;
    const ids = actionableIds;
    const body =
      action === 'archive' ? { action: 'archive', ids } : { action, ids, ...params };

    try {
      const res = await fetch('/api/artifacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Bulk operation failed');
      }

      const data = (await res.json()) as {
        result: {
          succeeded: string[];
          failed: Array<{ id: string; reason: string }>;
          skipped: Array<{ id: string; reason: string }>;
        };
      };

      setPendingBulk(null);
      handleExitSelectMode();
      await fetchArtifacts();

      // Surface partial failures — handleExitSelectMode() cleared bulkError,
      // so set after to ensure the message is visible
      if (data.result.failed.length > 0 || data.result.skipped.length > 0) {
        const parts: string[] = [];
        if (data.result.succeeded.length > 0)
          parts.push(`${data.result.succeeded.length} updated`);
        if (data.result.skipped.length > 0)
          parts.push(`${data.result.skipped.length} skipped`);
        if (data.result.failed.length > 0)
          parts.push(`${data.result.failed.length} failed`);
        setBulkError(parts.join(', ') + '.');
      }
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Bulk operation failed');
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Bulk action bar — sticky, appears when selection mode is active */}
      {isSelecting && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          totalCount={artifacts.length}
          isAllSelected={
            artifacts.length > 0 && selectedIds.size === artifacts.length
          }
          campaigns={campaigns}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onExitSelectMode={handleExitSelectMode}
          onRequestAction={handleRequestAction}
        />
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Artifacts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your saved marketing deliverables.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {artifacts.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                if (isSelecting) {
                  handleExitSelectMode();
                } else {
                  setIsSelecting(true);
                }
              }}
            >
              {isSelecting ? 'Cancel Select' : 'Select'}
            </Button>
          )}
          <Button asChild>
            <Link href="/sessions/new">Create in Session</Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <Input
          type="search"
          placeholder="Search by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-[220px]"
        />

        {/* Type filter */}
        <Select
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as ArtifactType | 'all')}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {ALL_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ARTIFACT_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as ArtifactStatus | 'all')}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Campaign filter */}
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

      {/* Bulk operation error banner */}
      {bulkError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          Bulk action failed: {bulkError}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setBulkError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-muted-foreground">Loading artifacts...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && artifacts.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-lg font-medium">No artifacts yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Start a session to generate marketing copy, strategies, and
              other deliverables. Saved outputs appear here.
            </p>
            <Button asChild className="mt-4">
              <Link href="/sessions/new">Start a session</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Artifact card grid */}
      {!loading && artifacts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {artifacts.map((artifact) => {
            const signal = computeSignal(artifact.performanceLogs);
            const artifactType = artifact.type as ArtifactType;
            const artifactStatus = artifact.status as ArtifactStatus;

            const isSelected = selectedIds.has(artifact.id);

            return (
              <div key={artifact.id} className="relative">
                {/* Checkbox overlay — only rendered in select mode */}
                {isSelecting && (
                  <div className="absolute top-3 left-3 z-10">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleSelection(artifact.id)}
                      aria-label={`Select "${artifact.title}"`}
                    />
                  </div>
                )}

                <Link
                  href={isSelecting ? '#' : `/artifacts/${artifact.id}`}
                  onClick={(e) => {
                    if (isSelecting) {
                      e.preventDefault();
                      handleToggleSelection(artifact.id);
                    }
                  }}
                  className="block"
                >
                  <Card
                    className={`transition-colors hover:bg-muted/50 h-full ${
                      isSelected ? 'ring-2 ring-primary ring-offset-1' : ''
                    }`}
                  >
                    <CardContent
                      className={`p-5 flex flex-col gap-3 h-full ${
                        isSelecting ? 'pl-10' : ''
                      }`}
                    >
                      {/* Top row: type badge + performance signal */}
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {ARTIFACT_TYPE_LABELS[artifactType] ?? artifact.type}
                        </Badge>
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${SIGNAL_DOT[signal]}`}
                          title={SIGNAL_LABEL[signal]}
                        />
                      </div>

                      {/* Title */}
                      <p className="font-medium leading-snug line-clamp-2">
                        {artifact.title}
                      </p>

                      {/* Campaign name */}
                      {artifact.campaign && (
                        <p className="text-xs text-muted-foreground truncate">
                          {artifact.campaign.name}
                        </p>
                      )}

                      {/* Bottom row: status + date */}
                      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_COLORS[artifactStatus] ?? ''
                          }`}
                        >
                          {STATUS_LABELS[artifactStatus] ?? artifact.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(artifact.updatedAt)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk confirmation dialog */}
      {pendingBulk && (
        <BulkConfirmDialog
          open
          onClose={() => setPendingBulk(null)}
          onConfirm={handleBulkConfirm}
          actionLabel={pendingBulk.actionLabel}
          totalSelected={selectedIds.size}
          skipped={pendingBulk.skipped}
          loading={bulkLoading}
        />
      )}
    </div>
  );
}
