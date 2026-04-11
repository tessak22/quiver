'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ArtifactType, ArtifactStatus, PerformanceSignal } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PerformanceLogRecord {
  id: string;
  logType: string;
  metrics: unknown;
  qualitativeNotes: string | null;
  whatWorked: string | null;
  whatDidnt: string | null;
  recordedAt: string;
}

interface ArtifactDetail {
  id: string;
  title: string;
  type: string;
  content: string;
  status: string;
  skillUsed: string | null;
  campaignId: string;
  sessionId: string | null;
  contextVersionId: string | null;
  version: number;
  parentArtifactId: string | null;
  tags: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  campaign: { id: string; name: string } | null;
  session: { id: string; title: string | null; mode: string } | null;
  contextVersion: { id: string; version: number } | null;
  performanceLogs: PerformanceLogRecord[];
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

// Valid next states for each status
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['review'],
  review: ['approved', 'draft'],
  approved: ['live', 'review'],
  live: ['archived'],
  archived: [],
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
  hour: 'numeric',
  minute: '2-digit',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
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

function formatShortDate(dateStr: string): string {
  return shortDateFormatter.format(new Date(dateStr));
}

function downloadAsMarkdown(title: string, content: string): void {
  const filename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ArtifactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const artifactId = params.id as string;

  const [artifact, setArtifact] = useState<ArtifactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const fetchArtifact = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/artifacts/${artifactId}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to load artifact');
      }

      const data = await res.json() as { artifact: ArtifactDetail };
      setArtifact(data.artifact);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artifact');
    } finally {
      setLoading(false);
    }
  }, [artifactId]);

  useEffect(() => {
    fetchArtifact();
  }, [fetchArtifact]);

  // Status transition
  async function handleStatusChange(newStatus: string) {
    if (!artifact) return;
    setStatusUpdating(true);

    try {
      const res = await fetch(`/api/artifacts/${artifact.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to update status');
      }

      const data = await res.json() as { artifact: ArtifactDetail };
      setArtifact(data.artifact);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  }

  // Copy to clipboard
  async function handleCopy() {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }

  // Download as .md
  function handleDownload() {
    if (!artifact) return;
    downloadAsMarkdown(artifact.title, artifact.content);
  }

  // Duplicate
  async function handleDuplicate() {
    if (!artifact) return;
    setDuplicating(true);

    try {
      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${artifact.title} (copy)`,
          type: artifact.type,
          content: artifact.content,
          campaignId: artifact.campaignId,
          sessionId: artifact.sessionId,
          skillUsed: artifact.skillUsed,
          tags: artifact.tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to duplicate artifact');
      }

      const data = await res.json() as { artifact: { id: string } };
      router.push(`/artifacts/${data.artifact.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate artifact');
      setDuplicating(false);
    }
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading artifact...</p>
      </div>
    );
  }

  // --- Error / not found ---
  if (!artifact) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-destructive">{error ?? 'Artifact not found'}</p>
        <Button asChild variant="outline">
          <Link href="/artifacts">Back to Artifacts</Link>
        </Button>
      </div>
    );
  }

  const artifactType = artifact.type as ArtifactType;
  const artifactStatus = artifact.status as ArtifactStatus;
  const signal = computeSignal(artifact.performanceLogs);
  const validTransitions = STATUS_TRANSITIONS[artifact.status] ?? [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/artifacts">Back</Link>
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive mb-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main content area */}
        <div className="space-y-6 min-w-0">
          {/* Title and badges */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge variant="outline">
                {ARTIFACT_TYPE_LABELS[artifactType] ?? artifact.type}
              </Badge>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  STATUS_COLORS[artifactStatus] ?? ''
                }`}
              >
                {STATUS_LABELS[artifactStatus] ?? artifact.status}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${SIGNAL_DOT[signal]}`}
                />
                {SIGNAL_LABEL[signal]}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {artifact.title}
            </h1>
          </div>

          {/* Content */}
          <Card>
            <CardContent className="p-6">
              <div className="whitespace-pre-wrap text-sm leading-relaxed break-words">
                {artifact.content}
              </div>
            </CardContent>
          </Card>

          {/* Performance Logs */}
          {artifact.performanceLogs.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Performance Logs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {artifact.performanceLogs.map((log) => (
                  <div key={log.id} className="border-b last:border-0 pb-3 last:pb-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(log.recordedAt)}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {log.logType}
                      </Badge>
                    </div>
                    {log.whatWorked && (
                      <div className="text-sm mt-1">
                        <span className="font-medium text-green-700 dark:text-green-400">
                          What worked:
                        </span>{' '}
                        {log.whatWorked}
                      </div>
                    )}
                    {log.whatDidnt && (
                      <div className="text-sm mt-1">
                        <span className="font-medium text-red-700 dark:text-red-400">
                          What didn&apos;t:
                        </span>{' '}
                        {log.whatDidnt}
                      </div>
                    )}
                    {log.qualitativeNotes && (
                      <div className="text-sm mt-1 text-muted-foreground">
                        {log.qualitativeNotes}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Export actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={handleCopy}
              >
                {copySuccess ? 'Copied!' : 'Copy to clipboard'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={handleDownload}
              >
                Download as .md
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={handleDuplicate}
                disabled={duplicating}
              >
                {duplicating ? 'Duplicating...' : 'Duplicate'}
              </Button>
            </CardContent>
          </Card>

          {/* Status transition */}
          {validTransitions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Transition Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Select
                  value=""
                  onValueChange={handleStatusChange}
                  disabled={statusUpdating}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={statusUpdating ? 'Updating...' : 'Move to...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {validTransitions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s as ArtifactStatus] ?? s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {artifact.campaign && (
                <div>
                  <span className="text-muted-foreground">Campaign:</span>{' '}
                  <Link
                    href={`/campaigns/${artifact.campaign.id}`}
                    className="font-medium hover:underline"
                  >
                    {artifact.campaign.name}
                  </Link>
                </div>
              )}

              {artifact.session && (
                <div>
                  <span className="text-muted-foreground">Session:</span>{' '}
                  <Link
                    href={`/sessions/${artifact.session.id}`}
                    className="font-medium hover:underline"
                  >
                    {artifact.session.title ?? 'Untitled session'}
                  </Link>
                </div>
              )}

              {artifact.contextVersion && (
                <div>
                  <span className="text-muted-foreground">Context version:</span>{' '}
                  <span className="font-medium">v{artifact.contextVersion.version}</span>
                </div>
              )}

              {artifact.skillUsed && (
                <div>
                  <span className="text-muted-foreground">Skill used:</span>{' '}
                  <Badge variant="outline" className="text-xs">
                    {artifact.skillUsed}
                  </Badge>
                </div>
              )}

              <div>
                <span className="text-muted-foreground">Version:</span>{' '}
                <span className="font-medium">{artifact.version}</span>
              </div>

              <div>
                <span className="text-muted-foreground">Created by:</span>{' '}
                <span className="font-medium font-mono text-xs">
                  {artifact.createdBy.slice(0, 8)}...
                </span>
              </div>

              <div>
                <span className="text-muted-foreground">Created:</span>{' '}
                <span className="font-medium">
                  {formatShortDate(artifact.createdAt)}
                </span>
              </div>

              <div>
                <span className="text-muted-foreground">Updated:</span>{' '}
                <span className="font-medium">
                  {formatShortDate(artifact.updatedAt)}
                </span>
              </div>

              {artifact.tags.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Tags:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {artifact.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
