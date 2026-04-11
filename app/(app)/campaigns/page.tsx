'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { CampaignStatus, CampaignPriority } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignRecord {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  channels: string[];
  status: string;
  priority: string;
  startDate: string | null;
  endDate: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    sessions: number;
    artifacts: number;
    performanceLogs: number;
  };
}

type ViewMode = 'board' | 'list';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<CampaignStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  paused: 'Paused',
  complete: 'Complete',
  archived: 'Archived',
};

const STATUS_COLORS: Record<CampaignStatus, string> = {
  planning: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  complete: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const PRIORITY_LABELS: Record<CampaignPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const BOARD_COLUMNS: CampaignStatus[] = ['planning', 'active', 'paused', 'complete'];

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function formatShortDate(dateStr: string): string {
  return shortDateFormatter.format(new Date(dateStr));
}

// ---------------------------------------------------------------------------
// Quick-create form state
// ---------------------------------------------------------------------------

interface CreateFormState {
  name: string;
  description: string;
  goal: string;
  channels: string;
  startDate: string;
  endDate: string;
  ownerId: string;
}

const INITIAL_FORM: CreateFormState = {
  name: '',
  description: '',
  goal: '',
  channels: '',
  startDate: '',
  endDate: '',
  ownerId: '',
};

// ---------------------------------------------------------------------------
// Campaign Card component
// ---------------------------------------------------------------------------

function CampaignCard({
  campaign,
  compact,
}: {
  campaign: CampaignRecord;
  compact?: boolean;
}) {
  const status = campaign.status as CampaignStatus;
  const isUnassigned = !campaign.ownerId;

  return (
    <Card
      className={`transition-colors hover:bg-muted/50 ${
        isUnassigned ? 'border-dashed opacity-75' : ''
      }`}
    >
      <Link href={`/campaigns/${campaign.id}`} className="block">
        <CardContent className={compact ? 'p-3' : 'py-4 px-5'}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
                >
                  {STATUS_LABELS[status]}
                </span>
                {campaign.priority !== 'medium' && (
                  <Badge variant="outline" className="text-xs">
                    {PRIORITY_LABELS[campaign.priority as CampaignPriority]}
                  </Badge>
                )}
              </div>
              <p className="mt-1.5 font-medium truncate">{campaign.name}</p>
              {campaign.goal && !compact && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {campaign.goal}
                </p>
              )}
            </div>
          </div>

          {/* Channels */}
          {campaign.channels.length > 0 && !compact && (
            <div className="flex flex-wrap gap-1 mt-2">
              {campaign.channels.map((channel) => (
                <Badge key={channel} variant="secondary" className="text-xs">
                  {channel}
                </Badge>
              ))}
            </div>
          )}

          {/* Footer info */}
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <span>
              {campaign._count.artifacts} artifact{campaign._count.artifacts !== 1 ? 's' : ''}
            </span>
            {isUnassigned ? (
              <span className="italic">Unassigned</span>
            ) : (
              <span>Updated {formatShortDate(campaign.updatedAt)}</span>
            )}
          </div>
        </CardContent>
      </Link>

    </Card>
  );
}

// ---------------------------------------------------------------------------
// Board View
// ---------------------------------------------------------------------------

function BoardView({ campaigns }: { campaigns: CampaignRecord[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {BOARD_COLUMNS.map((status) => {
        const columnCampaigns = campaigns.filter((c) => c.status === status);
        return (
          <div key={status} className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    status === 'planning'
                      ? 'bg-blue-500'
                      : status === 'active'
                        ? 'bg-green-500'
                        : status === 'paused'
                          ? 'bg-yellow-500'
                          : 'bg-purple-500'
                  }`}
                />
                {STATUS_LABELS[status]}
              </h3>
              <Badge variant="secondary" className="text-xs">
                {columnCampaigns.length}
              </Badge>
            </div>
            <div className="space-y-2 min-h-[100px]">
              {columnCampaigns.length === 0 && (
                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No campaigns
                </div>
              )}
              {columnCampaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} compact />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List View
// ---------------------------------------------------------------------------

function ListView({ campaigns }: { campaigns: CampaignRecord[] }) {
  return (
    <div className="space-y-2">
      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View and filter state
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all');

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Team members for owner dropdown
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetch('/api/team')
      .then((res) => res.json())
      .then((data: { members?: Array<{ id: string; name: string }> }) =>
        setTeamMembers(data.members ?? [])
      )
      .catch(() => {});
  }, []);

  // Fetch campaigns
  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/campaigns?${params.toString()}`);
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to load campaigns');
      }

      const data: { campaigns: CampaignRecord[] } = await res.json();
      setCampaigns(data.campaigns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Create campaign handler
  async function handleCreate() {
    if (!createForm.name.trim()) {
      setCreateError('Campaign name is required');
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          description: createForm.description.trim() || undefined,
          goal: createForm.goal.trim() || undefined,
          channels: createForm.channels
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean),
          startDate: createForm.startDate || undefined,
          endDate: createForm.endDate || undefined,
          ownerId: createForm.ownerId.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to create campaign');
      }

      setCreateForm(INITIAL_FORM);
      setCreateOpen(false);
      fetchCampaigns();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize and track your marketing campaigns.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>New Campaign</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Campaign</DialogTitle>
              <DialogDescription>
                Set up a new marketing campaign to organize your sessions and artifacts.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="campaign-name">Name *</Label>
                <Input
                  id="campaign-name"
                  placeholder="e.g. Q2 Product Launch"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-description">Description</Label>
                <Textarea
                  id="campaign-description"
                  placeholder="Brief description of the campaign..."
                  rows={2}
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-goal">Goal</Label>
                <Textarea
                  id="campaign-goal"
                  placeholder="What is the main objective of this campaign?"
                  rows={2}
                  value={createForm.goal}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, goal: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-channels">Channels (comma-separated)</Label>
                <Input
                  id="campaign-channels"
                  placeholder="e.g. email, social, paid ads"
                  value={createForm.channels}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, channels: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="campaign-start">Start Date</Label>
                  <Input
                    id="campaign-start"
                    type="date"
                    value={createForm.startDate}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="campaign-end">End Date</Label>
                  <Input
                    id="campaign-end"
                    type="date"
                    value={createForm.endDate}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-owner">Owner</Label>
                <select
                  id="campaign-owner"
                  value={createForm.ownerId}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, ownerId: e.target.value }))
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">No owner</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Campaign'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters and view toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as CampaignStatus | 'all')
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {BOARD_COLUMNS.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center rounded-md border">
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium rounded-l-md transition-colors ${
              viewMode === 'board'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
            onClick={() => setViewMode('board')}
          >
            Board
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-sm font-medium rounded-r-md transition-colors ${
              viewMode === 'list'
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
            onClick={() => setViewMode('list')}
          >
            List
          </button>
        </div>
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
          <p className="text-muted-foreground">Loading campaigns...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && campaigns.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-lg font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {statusFilter !== 'all'
                ? `No campaigns with "${STATUS_LABELS[statusFilter as CampaignStatus]}" status found.`
                : 'Create your first campaign to start organizing your marketing efforts, sessions, and content.'}
            </p>
            {statusFilter === 'all' && (
              <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                Create your first campaign
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Campaign views */}
      {!loading && campaigns.length > 0 && (
        viewMode === 'board' ? (
          <BoardView campaigns={campaigns} />
        ) : (
          <ListView campaigns={campaigns} />
        )
      )}
    </div>
  );
}
