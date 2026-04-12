'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from '@/components/ui/dialog';
import type {
  CampaignStatus,
  CampaignPriority,
  SessionMode,
  ArtifactStatus,
} from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignLink {
  label: string;
  url: string;
}

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
  links: CampaignLink[] | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    sessions: number;
    artifacts: number;
    performanceLogs: number;
  };
}

interface SessionRecord {
  id: string;
  title: string | null;
  mode: string;
  createdAt: string;
  updatedAt: string;
}

interface ArtifactRecord {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface PerformanceLogRecord {
  id: string;
  logType: string;
  qualitativeNotes: string | null;
  whatWorked: string | null;
  whatDidnt: string | null;
  recordedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
}

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

const PRIORITY_COLORS: Record<CampaignPriority, string> = {
  high: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  medium: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  low: 'bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400',
};

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

const ARTIFACT_STATUS_COLORS: Record<ArtifactStatus, string> = {
  draft: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  review: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  approved: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  live: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  archived: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

function formatDateTime(dateStr: string): string {
  return dateTimeFormatter.format(new Date(dateStr));
}

// ---------------------------------------------------------------------------
// Edit form state
// ---------------------------------------------------------------------------

interface EditFormState {
  name: string;
  description: string;
  goal: string;
  channels: string;
  status: CampaignStatus;
  priority: CampaignPriority;
  startDate: string;
  endDate: string;
  ownerId: string;
  links: CampaignLink[];
}

// ---------------------------------------------------------------------------
// Sessions Tab
// ---------------------------------------------------------------------------

function SessionsTab({ campaignId }: { campaignId: string }) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSessions() {
      setLoading(true);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}?include=sessions`);
        if (res.ok) {
          const data: { sessions: SessionRecord[] } = await res.json();
          setSessions(data.sessions);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, [campaignId]);

  if (loading) {
    return <p className="text-muted-foreground py-8 text-center">Loading sessions...</p>;
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No sessions linked to this campaign yet.
          </p>
          <Button asChild variant="outline" className="mt-3" size="sm">
            <Link href="/sessions/new">Start a session</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((session) => {
        const mode = session.mode as SessionMode;
        return (
          <Link key={session.id} href={`/sessions/${session.id}`} className="block">
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between gap-4 py-3 px-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        MODE_COLORS[mode] ?? ''
                      }`}
                    >
                      {MODE_LABELS[mode] ?? mode}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium truncate">
                    {session.title ?? 'Untitled session'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Last updated {formatDateTime(session.updatedAt)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Artifacts Tab
// ---------------------------------------------------------------------------

function ArtifactsTab({ campaignId }: { campaignId: string }) {
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchArtifacts() {
      setLoading(true);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}?include=artifacts`);
        if (res.ok) {
          const data: { artifacts: ArtifactRecord[] } = await res.json();
          setArtifacts(data.artifacts);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchArtifacts();
  }, [campaignId]);

  if (loading) {
    return <p className="text-muted-foreground py-8 text-center">Loading artifacts...</p>;
  }

  if (artifacts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No artifacts created for this campaign yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {artifacts.map((artifact) => {
        const artifactStatus = artifact.status as ArtifactStatus;
        return (
          <Link key={artifact.id} href={`/artifacts/${artifact.id}`} className="block">
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="flex items-center justify-between gap-4 py-3 px-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {artifact.type.replace(/_/g, ' ')}
                    </Badge>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        ARTIFACT_STATUS_COLORS[artifactStatus] ?? ''
                      }`}
                    >
                      {artifactStatus}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium truncate">{artifact.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created {formatDateTime(artifact.createdAt)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Performance Logs Tab
// ---------------------------------------------------------------------------

function PerformanceTab({ campaignId }: { campaignId: string }) {
  const [logs, setLogs] = useState<PerformanceLogRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}?include=performance`);
        if (res.ok) {
          const data: { performanceLogs: PerformanceLogRecord[] } = await res.json();
          setLogs(data.performanceLogs);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [campaignId]);

  if (loading) {
    return (
      <p className="text-muted-foreground py-8 text-center">Loading performance logs...</p>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No performance logs recorded for this campaign yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <Card key={log.id}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs">
                {log.logType.replace(/_/g, ' ')}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(log.recordedAt)}
              </span>
              {log.periodStart && log.periodEnd && (
                <span className="text-xs text-muted-foreground">
                  ({formatDate(log.periodStart)} - {formatDate(log.periodEnd)})
                </span>
              )}
            </div>
            {log.qualitativeNotes && (
              <p className="text-sm mt-1">{log.qualitativeNotes}</p>
            )}
            <div className="flex gap-4 mt-2">
              {log.whatWorked && (
                <div className="flex-1">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400">
                    What worked
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{log.whatWorked}</p>
                </div>
              )}
              {log.whatDidnt && (
                <div className="flex-1">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400">
                    What didn&apos;t
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{log.whatDidnt}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaignId = params.id;

  const [campaign, setCampaign] = useState<CampaignRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    description: '',
    goal: '',
    channels: '',
    status: 'planning',
    priority: 'medium',
    startDate: '',
    endDate: '',
    ownerId: '',
    links: [],
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Team members for owner display and dropdown
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetch('/api/team')
      .then((res) => res.json())
      .then((data: { members?: Array<{ id: string; name: string }> }) =>
        setTeamMembers(data.members ?? [])
      )
      .catch(() => {});
  }, []);

  function getOwnerName(ownerId: string | null): string {
    if (!ownerId) return 'Unassigned';
    const member = teamMembers.find((m) => m.id === ownerId);
    return member?.name ?? ownerId;
  }

  // Fetch campaign
  const fetchCampaign = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to load campaign');
      }

      const data: { campaign: CampaignRecord } = await res.json();
      setCampaign(data.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchCampaign();
  }, [fetchCampaign]);

  // Populate edit form when opening dialog
  function openEditDialog() {
    if (!campaign) return;
    setEditForm({
      name: campaign.name,
      description: campaign.description ?? '',
      goal: campaign.goal ?? '',
      channels: campaign.channels.join(', '),
      status: campaign.status as CampaignStatus,
      priority: campaign.priority as CampaignPriority,
      startDate: campaign.startDate
        ? new Date(campaign.startDate).toISOString().split('T')[0]
        : '',
      endDate: campaign.endDate
        ? new Date(campaign.endDate).toISOString().split('T')[0]
        : '',
      ownerId: campaign.ownerId ?? '',
      links: Array.isArray(campaign.links) ? campaign.links : [],
    });
    setEditError(null);
    setEditOpen(true);
  }

  // Edit save handler
  async function handleSave() {
    if (!editForm.name.trim()) {
      setEditError('Campaign name is required');
      return;
    }

    setSaving(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          description: editForm.description.trim() || null,
          goal: editForm.goal.trim() || null,
          channels: editForm.channels
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean),
          status: editForm.status,
          priority: editForm.priority,
          startDate: editForm.startDate || null,
          endDate: editForm.endDate || null,
          ownerId: editForm.ownerId.trim() || null,
          links: editForm.links.filter(
            (l) => l.label.trim() && l.url.trim()
          ),
        }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to update campaign');
      }

      const data: { campaign: CampaignRecord } = await res.json();
      setCampaign(data.campaign);
      setEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update campaign');
    } finally {
      setSaving(false);
    }
  }

  // Archive handler
  async function handleArchive() {
    if (!confirm('Are you sure you want to archive this campaign? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to archive campaign');
      }

      router.push('/campaigns');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive campaign');
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-4 md:p-6 lg:p-8">
        <p className="text-muted-foreground">Loading campaign...</p>
      </div>
    );
  }

  // Error state
  if (error && !campaign) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto space-y-4">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
        <Button variant="outline" asChild>
          <Link href="/campaigns">Back to campaigns</Link>
        </Button>
      </div>
    );
  }

  if (!campaign) return null;

  const status = campaign.status as CampaignStatus;
  const priority = campaign.priority as CampaignPriority;

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/campaigns" className="hover:underline">
          Campaigns
        </Link>
        <span>/</span>
        <span className="text-foreground">{campaign.name}</span>
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

      {/* Campaign header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
            >
              {STATUS_LABELS[status]}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[priority]}`}
            >
              {PRIORITY_LABELS[priority]} priority
            </span>
          </div>

          {campaign.goal && (
            <p className="text-sm text-muted-foreground max-w-2xl">{campaign.goal}</p>
          )}

          {campaign.description && (
            <p className="text-sm text-muted-foreground max-w-2xl">{campaign.description}</p>
          )}

          {/* Channels */}
          {campaign.channels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {campaign.channels.map((channel) => (
                <Badge key={channel} variant="secondary" className="text-xs">
                  {channel}
                </Badge>
              ))}
            </div>
          )}

          {/* Dates and owner */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {campaign.startDate && (
              <span>Starts {formatDate(campaign.startDate)}</span>
            )}
            {campaign.endDate && <span>Ends {formatDate(campaign.endDate)}</span>}
            <span>{campaign.ownerId ? `Owner: ${getOwnerName(campaign.ownerId)}` : ''}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" onClick={openEditDialog}>
            Edit
          </Button>

          {status !== 'archived' && (
            <Button variant="outline" onClick={handleArchive}>
              Archive
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Reference links */}
      {Array.isArray(campaign.links) && campaign.links.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Reference Links
          </p>
          <div className="flex flex-wrap gap-2">
            {campaign.links.map((link, idx) => (
              <a
                key={idx}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                {link.label}
                <svg
                  className="ml-1 h-3 w-3"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-4.5-4.5h6m0 0v6m0-6L9.75 14.25"
                  />
                </svg>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold">{campaign._count.sessions}</p>
            <p className="text-xs text-muted-foreground">Sessions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold">{campaign._count.artifacts}</p>
            <p className="text-xs text-muted-foreground">Artifacts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <p className="text-2xl font-bold">{campaign._count.performanceLogs}</p>
            <p className="text-xs text-muted-foreground">Performance Logs</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions">
            Sessions ({campaign._count.sessions})
          </TabsTrigger>
          <TabsTrigger value="artifacts">
            Artifacts ({campaign._count.artifacts})
          </TabsTrigger>
          <TabsTrigger value="performance">
            Performance ({campaign._count.performanceLogs})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          <SessionsTab campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="artifacts">
          <ArtifactsTab campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceTab campaignId={campaignId} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Campaign</DialogTitle>
            <DialogDescription>
              Update campaign details. Status changes use the dropdown above.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                rows={2}
                value={editForm.description}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, description: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-goal">Goal</Label>
              <Textarea
                id="edit-goal"
                rows={2}
                value={editForm.goal}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, goal: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-channels">Channels (comma-separated)</Label>
              <Input
                id="edit-channels"
                value={editForm.channels}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, channels: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    status: value as CampaignStatus,
                  }))
                }
              >
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-priority">Priority</Label>
              <Select
                value={editForm.priority}
                onValueChange={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    priority: value as CampaignPriority,
                  }))
                }
              >
                <SelectTrigger id="edit-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-start">Start Date</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={editForm.startDate}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-end">End Date</Label>
                <Input
                  id="edit-end"
                  type="date"
                  value={editForm.endDate}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-owner">Owner</Label>
              <select
                id="edit-owner"
                value={editForm.ownerId}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, ownerId: e.target.value }))
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
            {/* Reference links editor */}
            <div className="grid gap-2">
              <Label>Reference Links</Label>
              <div className="space-y-2">
                {editForm.links.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder="Label"
                      value={link.label}
                      onChange={(e) => {
                        const updated = [...editForm.links];
                        updated[idx] = { ...updated[idx], label: e.target.value };
                        setEditForm((prev) => ({ ...prev, links: updated }));
                      }}
                      className="flex-1"
                    />
                    <Input
                      placeholder="https://..."
                      value={link.url}
                      onChange={(e) => {
                        const updated = [...editForm.links];
                        updated[idx] = { ...updated[idx], url: e.target.value };
                        setEditForm((prev) => ({ ...prev, links: updated }));
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = editForm.links.filter((_, i) => i !== idx);
                        setEditForm((prev) => ({ ...prev, links: updated }));
                      }}
                      className="shrink-0 px-2"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEditForm((prev) => ({
                      ...prev,
                      links: [...prev.links, { label: '', url: '' }],
                    }))
                  }
                >
                  Add link
                </Button>
              </div>
            </div>
            {editError && (
              <p className="text-sm text-destructive">{editError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
