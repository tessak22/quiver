// 'use client' — required for useState, useEffect, useCallback, useParams,
// form interactions, auto-save, and dynamic tab content
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Sparkline } from '@/components/content/sparkline';
import type {
  ContentType,
  ContentStatus,
  DistributionChannel,
  PerformanceSignal,
} from '@/types';
import {
  CONTENT_TYPE_LABELS,
  CONTENT_STATUSES,
  DISTRIBUTION_CHANNELS,
  DISTRIBUTION_CHANNEL_LABELS,
} from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DistributionRecord {
  id: string;
  channel: string;
  url: string | null;
  publishedAt: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface MetricSnapshot {
  id: string;
  snapshotDate: string;
  pageviews: number | null;
  uniqueVisitors: number | null;
  avgTimeOnPage: number | null;
  bounceRate: number | null;
  organicClicks: number | null;
  impressions: number | null;
  avgPosition: number | null;
  ctr: number | null;
  socialShares: number | null;
  backlinks: number | null;
  comments: number | null;
  signups: number | null;
  conversionRate: number | null;
  source: string;
  notes: string | null;
  recordedBy: string;
}

interface DerivedContent {
  id: string;
  title: string;
  contentType: string;
  slug: string;
  status: string;
}

interface ParentContent {
  id: string;
  title: string;
  contentType: string;
  slug: string;
}

interface ContentDetail {
  id: string;
  title: string;
  slug: string;
  contentType: string;
  status: string;
  body: string;
  excerpt: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  targetKeyword: string | null;
  secondaryKeywords: string[];
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  twitterCardType: string | null;
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
  createdBy: string;
  campaignId: string | null;
  campaign: { id: string; name: string } | null;
  distributions: DistributionRecord[];
  metricSnapshots: MetricSnapshot[];
  derivedContent: DerivedContent[];
  parentContent: ParentContent | null;
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

const CHANNEL_COLORS: Record<DistributionChannel, string> = {
  website: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  dev_to: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  hashnode: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  medium: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  newsletter: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  linkedin: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  twitter: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  youtube: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const SIGNAL_DOT: Record<PerformanceSignal, string> = {
  no_data: 'bg-gray-400',
  logging: 'bg-amber-400',
  strong: 'bg-green-500',
  weak: 'bg-red-500',
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const numberFormatter = new Intl.NumberFormat('en-US');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

function formatDateTime(dateStr: string): string {
  return dateTimeFormatter.format(new Date(dateStr));
}

function formatNumber(n: number | null): string {
  if (n === null) return '--';
  return numberFormatter.format(n);
}

function formatDecimal(n: number | null, digits: number = 1): string {
  if (n === null) return '--';
  return n.toFixed(digits);
}

async function readJsonResponse<T>(
  response: Response,
  fallbackError: string
): Promise<T> {
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? fallbackError);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ContentDetailPage() {
  const params = useParams();
  const contentId = params.id as string;

  const [piece, setPiece] = useState<ContentDetail | null>(null);
  const [perfSignal, setPerfSignal] = useState<PerformanceSignal>('no_data');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit tab state
  const [editBody, setEditBody] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // SEO tab state
  const [seoForm, setSeoForm] = useState({
    metaTitle: '',
    metaDescription: '',
    targetKeyword: '',
    secondaryKeywords: '',
    canonicalUrl: '',
  });
  const [seoSaving, setSeoSaving] = useState(false);

  // OG tab state
  const [ogForm, setOgForm] = useState({
    ogTitle: '',
    ogDescription: '',
    ogImageUrl: '',
    twitterCardType: 'summary_large_image',
  });
  const [ogSaving, setOgSaving] = useState(false);

  // Distribution form
  const [showDistForm, setShowDistForm] = useState(false);
  const [distForm, setDistForm] = useState({
    channel: 'website' as string,
    url: '',
    status: 'planned',
    notes: '',
  });
  const [distSaving, setDistSaving] = useState(false);

  // Metrics form
  const [showMetricsForm, setShowMetricsForm] = useState(false);
  const [metricsForm, setMetricsForm] = useState({
    pageviews: '',
    uniqueVisitors: '',
    avgTimeOnPage: '',
    bounceRate: '',
    organicClicks: '',
    impressions: '',
    avgPosition: '',
    ctr: '',
    socialShares: '',
    backlinks: '',
    comments: '',
    signups: '',
    conversionRate: '',
  });
  const [metricsSaving, setMetricsSaving] = useState(false);

  // Snapshots expander
  const [showAllSnapshots, setShowAllSnapshots] = useState(false);

  // Status updating
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Published date editing
  const [editingPublishedAt, setEditingPublishedAt] = useState(false);
  const [publishedAtInput, setPublishedAtInput] = useState('');

  // Copy states
  const [slugCopied, setSlugCopied] = useState(false);
  const [apiUrlCopied, setApiUrlCopied] = useState(false);

  // Fetch content piece
  const fetchPiece = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await readJsonResponse<{
        contentPiece: ContentDetail;
        performanceSignal?: PerformanceSignal;
      }>(await fetch(`/api/content/${contentId}`), 'Failed to load content');
      setPiece(data.contentPiece);
      setPerfSignal(data.performanceSignal ?? 'no_data');
      setEditBody(data.contentPiece.body);
      setSeoForm({
        metaTitle: data.contentPiece.metaTitle ?? '',
        metaDescription: data.contentPiece.metaDescription ?? '',
        targetKeyword: data.contentPiece.targetKeyword ?? '',
        secondaryKeywords: (data.contentPiece.secondaryKeywords ?? []).join(', '),
        canonicalUrl: data.contentPiece.canonicalUrl ?? '',
      });
      setOgForm({
        ogTitle: data.contentPiece.ogTitle ?? '',
        ogDescription: data.contentPiece.ogDescription ?? '',
        ogImageUrl: data.contentPiece.ogImageUrl ?? '',
        twitterCardType: data.contentPiece.twitterCardType ?? 'summary_large_image',
      });
    } catch (err) {
      console.error('[content/detail] Failed to load content', {
        contentId,
        error: err,
      });
      setError(err instanceof Error ? err.message : 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [contentId]);

  useEffect(() => {
    fetchPiece();
  }, [fetchPiece]);

  useEffect(() => {
    return () => {
      if (saveStateTimerRef.current) {
        clearTimeout(saveStateTimerRef.current);
      }
    };
  }, []);

  // Auto-save body on blur
  async function handleBodyBlur() {
    if (!piece || editBody === piece.body || saveState === 'saving') return;
    if (saveStateTimerRef.current) {
      clearTimeout(saveStateTimerRef.current);
      saveStateTimerRef.current = null;
    }

    setSaveState('saving');
    try {
      const data = await readJsonResponse<{
        contentPiece: ContentDetail;
        performanceSignal?: PerformanceSignal;
      }>(
        await fetch(`/api/content/${contentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: editBody }),
        }),
        'Failed to save content'
      );

      setPiece(data.contentPiece);
      if (data.performanceSignal) setPerfSignal(data.performanceSignal);
      setSaveState('saved');
      saveStateTimerRef.current = setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      console.error('[content/detail] Autosave failed', {
        contentId,
        error: err,
      });
      setError(err instanceof Error ? err.message : 'Failed to save content');
      setSaveState('error');
      saveStateTimerRef.current = setTimeout(() => setSaveState('idle'), 3000);
    }
  }

  // Save SEO
  async function handleSeoSave() {
    setSeoSaving(true);
    try {
      const data = await readJsonResponse<{
        contentPiece: ContentDetail;
        performanceSignal?: PerformanceSignal;
      }>(
        await fetch(`/api/content/${contentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metaTitle: seoForm.metaTitle || null,
            metaDescription: seoForm.metaDescription || null,
            targetKeyword: seoForm.targetKeyword || null,
            secondaryKeywords: seoForm.secondaryKeywords
              ? seoForm.secondaryKeywords.split(',').map((k) => k.trim()).filter(Boolean)
              : [],
            canonicalUrl: seoForm.canonicalUrl || null,
          }),
        }),
        'Failed to save SEO settings'
      );
      setPiece(data.contentPiece);
      if (data.performanceSignal) setPerfSignal(data.performanceSignal);
    } catch (err) {
      console.error('[content/detail] Failed to save SEO settings', {
        contentId,
        error: err,
      });
      setError(err instanceof Error ? err.message : 'Failed to save SEO settings');
    } finally {
      setSeoSaving(false);
    }
  }

  // Save OG
  async function handleOgSave() {
    setOgSaving(true);
    try {
      const data = await readJsonResponse<{
        contentPiece: ContentDetail;
        performanceSignal?: PerformanceSignal;
      }>(
        await fetch(`/api/content/${contentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ogTitle: ogForm.ogTitle || null,
            ogDescription: ogForm.ogDescription || null,
            ogImageUrl: ogForm.ogImageUrl || null,
            twitterCardType: ogForm.twitterCardType,
          }),
        }),
        'Failed to save OG settings'
      );
      setPiece(data.contentPiece);
      if (data.performanceSignal) setPerfSignal(data.performanceSignal);
    } catch (err) {
      console.error('[content/detail] Failed to save OG settings', {
        contentId,
        error: err,
      });
      setError(err instanceof Error ? err.message : 'Failed to save OG settings');
    } finally {
      setOgSaving(false);
    }
  }

  // Status change
  async function handleStatusChange(newStatus: string) {
    if (!piece) return;
    setStatusUpdating(true);
    try {
      const data = await readJsonResponse<{
        contentPiece: ContentDetail;
        performanceSignal?: PerformanceSignal;
      }>(
        await fetch(`/api/content/${contentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        }),
        'Failed to update status'
      );
      setPiece(data.contentPiece);
      if (data.performanceSignal) setPerfSignal(data.performanceSignal);
    } catch (err) {
      console.error('[content/detail] Failed to update status', {
        contentId,
        status: newStatus,
        error: err,
      });
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  }

  // Published date save
  async function handlePublishedAtSave() {
    try {
      const data = await readJsonResponse<{
        contentPiece: ContentDetail;
        performanceSignal?: PerformanceSignal;
      }>(
        await fetch(`/api/content/${contentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publishedAt: publishedAtInput ? new Date(publishedAtInput).toISOString() : null,
          }),
        }),
        'Failed to update published date'
      );
      setPiece(data.contentPiece);
      if (data.performanceSignal) setPerfSignal(data.performanceSignal);
      setEditingPublishedAt(false);
    } catch (err) {
      console.error('[content/detail] Failed to update published date', {
        contentId,
        error: err,
      });
      setError(err instanceof Error ? err.message : 'Failed to update published date');
    }
  }

  // Add distribution
  async function handleAddDistribution() {
    setDistSaving(true);
    try {
      await readJsonResponse<{ distribution: unknown }>(
        await fetch(`/api/content/${contentId}/distributions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: distForm.channel,
            url: distForm.url || undefined,
            status: distForm.status,
            notes: distForm.notes || undefined,
          }),
        }),
        'Failed to add distribution'
      );
      setDistForm({ channel: 'website', url: '', status: 'planned', notes: '' });
      setShowDistForm(false);
      await fetchPiece();
    } catch (err) {
      console.error('[content/detail] Failed to add distribution', {
        contentId,
        error: err,
      });
      setError(err instanceof Error ? err.message : 'Failed to add distribution');
    } finally {
      setDistSaving(false);
    }
  }

  // Delete distribution
  async function handleDeleteDistribution(distId: string) {
    try {
      await readJsonResponse<{ success: true }>(
        await fetch(`/api/content/${contentId}/distributions/${distId}`, {
          method: 'DELETE',
        }),
        'Failed to delete distribution'
      );
      await fetchPiece();
    } catch (err) {
      console.error('[content/detail] Failed to delete distribution', {
        contentId,
        distributionId: distId,
        error: err,
      });
      setError(err instanceof Error ? err.message : 'Failed to delete distribution');
    }
  }

  // Log metrics
  async function handleLogMetrics() {
    setMetricsSaving(true);
    try {
      const payload: Record<string, number | undefined> = {};
      if (metricsForm.pageviews) payload.pageviews = parseInt(metricsForm.pageviews, 10);
      if (metricsForm.uniqueVisitors) payload.uniqueVisitors = parseInt(metricsForm.uniqueVisitors, 10);
      if (metricsForm.avgTimeOnPage) payload.avgTimeOnPage = parseInt(metricsForm.avgTimeOnPage, 10);
      if (metricsForm.bounceRate) payload.bounceRate = parseFloat(metricsForm.bounceRate);
      if (metricsForm.organicClicks) payload.organicClicks = parseInt(metricsForm.organicClicks, 10);
      if (metricsForm.impressions) payload.impressions = parseInt(metricsForm.impressions, 10);
      if (metricsForm.avgPosition) payload.avgPosition = parseFloat(metricsForm.avgPosition);
      if (metricsForm.ctr) payload.ctr = parseFloat(metricsForm.ctr);
      if (metricsForm.socialShares) payload.socialShares = parseInt(metricsForm.socialShares, 10);
      if (metricsForm.backlinks) payload.backlinks = parseInt(metricsForm.backlinks, 10);
      if (metricsForm.comments) payload.comments = parseInt(metricsForm.comments, 10);
      if (metricsForm.signups) payload.signups = parseInt(metricsForm.signups, 10);
      if (metricsForm.conversionRate) payload.conversionRate = parseFloat(metricsForm.conversionRate);

      await readJsonResponse<{ snapshot: unknown }>(
        await fetch(`/api/content/${contentId}/metrics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        'Failed to log metrics'
      );
      setMetricsForm({
        pageviews: '',
        uniqueVisitors: '',
        avgTimeOnPage: '',
        bounceRate: '',
        organicClicks: '',
        impressions: '',
        avgPosition: '',
        ctr: '',
        socialShares: '',
        backlinks: '',
        comments: '',
        signups: '',
        conversionRate: '',
      });
      setShowMetricsForm(false);
      await fetchPiece();
    } catch (err) {
      console.error('[content/detail] Failed to log metrics', {
        contentId,
        error: err,
      });
      setError(err instanceof Error ? err.message : 'Failed to log metrics');
    } finally {
      setMetricsSaving(false);
    }
  }

  // Copy helpers
  async function copyToClipboard(text: string, setter: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch (err) {
      console.error('[content/detail] Failed to copy to clipboard', {
        contentId,
        error: err,
      });
      setError('Failed to copy to clipboard');
    }
  }

  // Repurpose handler
  async function handleRepurpose() {
    if (!piece) return;
    try {
      const data = await readJsonResponse<{ contentPiece: { id: string } }>(
        await fetch('/api/content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `${piece.title} (repurposed)`,
            contentType: piece.contentType,
            body: piece.body,
            parentContentId: piece.id,
            campaignId: piece.campaignId,
          }),
        }),
        'Failed to repurpose content'
      );
      window.location.href = `/content/${data.contentPiece.id}`;
    } catch (err) {
      console.error('[content/detail] Failed to repurpose content', {
        contentId,
        error: err,
      });
      setError(err instanceof Error ? err.message : 'Failed to repurpose content');
    }
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading content...</p>
      </div>
    );
  }

  // --- Error / not found ---
  if (!piece) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-destructive">{error ?? 'Content not found'}</p>
        <Button asChild variant="outline">
          <Link href="/content">Back to Content</Link>
        </Button>
      </div>
    );
  }

  const cs = piece.status as ContentStatus;
  const signal = perfSignal;
  const latest = piece.metricSnapshots[0] ?? null;

  // Sparkline data — pageviews, reversed so oldest first
  const sparklineData = [...piece.metricSnapshots]
    .reverse()
    .map((s) => s.pageviews ?? 0);

  // Render markdown — sanitize to prevent stored XSS
  const renderedHtml = DOMPurify.sanitize(marked(piece.body) as string);

  // Public API URL
  const publicApiUrl = `/api/public/content/${piece.slug}`;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/content">Back</Link>
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
        {/* Left column */}
        <div className="space-y-6 min-w-0">
          {/* Title */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge variant="outline">
                {CONTENT_TYPE_LABELS[piece.contentType as ContentType] ?? piece.contentType}
              </Badge>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[cs] ?? ''}`}
              >
                {STATUS_LABELS[cs] ?? piece.status}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`inline-block h-2 w-2 rounded-full ${SIGNAL_DOT[signal]}`} />
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{piece.title}</h1>
          </div>

          {/* Content tabs */}
          <Tabs defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
              <TabsTrigger value="og">OG</TabsTrigger>
            </TabsList>

            {/* Preview tab */}
            <TabsContent value="preview" className="mt-4">
              <Card>
                <CardContent className="p-6">
                  <div
                    className="prose max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Edit tab */}
            <TabsContent value="edit" className="mt-4">
              <Card>
                <CardContent className="p-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Content (markdown)</Label>
                    <span className="text-xs text-muted-foreground">
                      {saveState === 'saving' && 'Saving...'}
                      {saveState === 'saved' && 'Saved'}
                      {saveState === 'error' && 'Save failed'}
                    </span>
                  </div>
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    onBlur={handleBodyBlur}
                    rows={24}
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* SEO tab */}
            <TabsContent value="seo" className="mt-4">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label>Meta title</Label>
                    <Input
                      value={seoForm.metaTitle}
                      onChange={(e) => setSeoForm({ ...seoForm, metaTitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Meta description
                      <span className={`ml-2 text-xs ${seoForm.metaDescription.length >= 150 && seoForm.metaDescription.length <= 160 ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {seoForm.metaDescription.length}/160
                      </span>
                    </Label>
                    <Textarea
                      value={seoForm.metaDescription}
                      onChange={(e) => setSeoForm({ ...seoForm, metaDescription: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Target keyword</Label>
                      <Input
                        value={seoForm.targetKeyword}
                        onChange={(e) => setSeoForm({ ...seoForm, targetKeyword: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Secondary keywords</Label>
                      <Input
                        value={seoForm.secondaryKeywords}
                        onChange={(e) => setSeoForm({ ...seoForm, secondaryKeywords: e.target.value })}
                        placeholder="Comma-separated"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Canonical URL</Label>
                    <Input
                      value={seoForm.canonicalUrl}
                      onChange={(e) => setSeoForm({ ...seoForm, canonicalUrl: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleSeoSave} disabled={seoSaving}>
                    {seoSaving ? 'Saving...' : 'Save SEO'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* OG tab */}
            <TabsContent value="og" className="mt-4">
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="space-y-2">
                    <Label>OG title</Label>
                    <Input
                      value={ogForm.ogTitle}
                      onChange={(e) => setOgForm({ ...ogForm, ogTitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OG description</Label>
                    <Textarea
                      value={ogForm.ogDescription}
                      onChange={(e) => setOgForm({ ...ogForm, ogDescription: e.target.value })}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>OG image URL</Label>
                    <Input
                      value={ogForm.ogImageUrl}
                      onChange={(e) => setOgForm({ ...ogForm, ogImageUrl: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Twitter card type</Label>
                    <Select
                      value={ogForm.twitterCardType}
                      onValueChange={(v) => setOgForm({ ...ogForm, twitterCardType: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="summary_large_image">Summary Large Image</SelectItem>
                        <SelectItem value="summary">Summary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Social preview mockup */}
                  <div className="border rounded-lg overflow-hidden">
                    {ogForm.ogImageUrl && (
                      <div className="bg-muted h-40 flex items-center justify-center text-xs text-muted-foreground">
                        OG Image Preview
                      </div>
                    )}
                    <div className="p-3 space-y-1">
                      <p className="text-sm font-semibold line-clamp-1">
                        {ogForm.ogTitle || piece.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {ogForm.ogDescription || piece.excerpt || 'No description'}
                      </p>
                    </div>
                  </div>

                  <Button onClick={handleOgSave} disabled={ogSaving}>
                    {ogSaving ? 'Saving...' : 'Save OG'}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Distributions */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Distributions</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDistForm(!showDistForm)}
                >
                  {showDistForm ? 'Cancel' : '+ Add distribution'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Add form */}
              {showDistForm && (
                <div className="border rounded-md p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Channel</Label>
                      <Select
                        value={distForm.channel}
                        onValueChange={(v) => setDistForm({ ...distForm, channel: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DISTRIBUTION_CHANNELS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {DISTRIBUTION_CHANNEL_LABELS[c]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">URL</Label>
                      <Input
                        value={distForm.url}
                        onChange={(e) => setDistForm({ ...distForm, url: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Input
                      value={distForm.notes}
                      onChange={(e) => setDistForm({ ...distForm, notes: e.target.value })}
                    />
                  </div>
                  <Button size="sm" onClick={handleAddDistribution} disabled={distSaving}>
                    {distSaving ? 'Adding...' : 'Add'}
                  </Button>
                </div>
              )}

              {/* Distribution list */}
              {piece.distributions.length === 0 && !showDistForm && (
                <p className="text-sm text-muted-foreground">No distributions yet.</p>
              )}
              {piece.distributions.map((dist) => {
                const ch = dist.channel as DistributionChannel;
                return (
                  <div
                    key={dist.id}
                    className="flex items-center justify-between gap-3 border-b last:border-0 pb-2 last:pb-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${CHANNEL_COLORS[ch] ?? CHANNEL_COLORS.other}`}
                      >
                        {DISTRIBUTION_CHANNEL_LABELS[ch] ?? dist.channel}
                      </span>
                      {dist.url && (
                        <a
                          href={dist.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline truncate"
                        >
                          {dist.url}
                        </a>
                      )}
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {dist.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {dist.publishedAt && (
                        <span className="text-xs text-muted-foreground">
                          {formatDate(dist.publishedAt)}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-destructive h-auto py-1 px-2"
                        onClick={() => handleDeleteDistribution(dist.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Repurposed content */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Repurposed Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {piece.parentContent && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Repurposed from: </span>
                  <Link
                    href={`/content/${piece.parentContent.id}`}
                    className="font-medium hover:underline"
                  >
                    {piece.parentContent.title}
                  </Link>
                </div>
              )}
              {piece.derivedContent.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Repurposed as:</p>
                  {piece.derivedContent.map((d) => (
                    <Link
                      key={d.id}
                      href={`/content/${d.id}`}
                      className="block text-sm font-medium hover:underline"
                    >
                      {d.title}
                    </Link>
                  ))}
                </div>
              )}
              {!piece.parentContent && piece.derivedContent.length === 0 && (
                <p className="text-sm text-muted-foreground">No repurposed content.</p>
              )}
              <Button variant="outline" size="sm" onClick={handleRepurpose}>
                + Repurpose this content
              </Button>
            </CardContent>
          </Card>

          {/* Performance */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Performance</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMetricsForm(!showMetricsForm)}
                >
                  {showMetricsForm ? 'Cancel' : '+ Log metrics'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Sparkline */}
              {sparklineData.length > 1 && (
                <div>
                  <Sparkline
                    data={sparklineData}
                    width={300}
                    height={40}
                    color="#3b82f6"
                  />
                </div>
              )}

              {/* Latest snapshot values */}
              {latest && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Pageviews</p>
                    <p className="text-sm font-semibold">{formatNumber(latest.pageviews)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Organic clicks</p>
                    <p className="text-sm font-semibold">{formatNumber(latest.organicClicks)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg position</p>
                    <p className="text-sm font-semibold">{formatDecimal(latest.avgPosition)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Signups</p>
                    <p className="text-sm font-semibold">{formatNumber(latest.signups)}</p>
                  </div>
                </div>
              )}

              {!latest && !showMetricsForm && (
                <p className="text-sm text-muted-foreground">No metrics recorded yet.</p>
              )}

              {/* Metrics form */}
              {showMetricsForm && (
                <div className="border rounded-md p-3 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {([
                      ['pageviews', 'Pageviews'],
                      ['uniqueVisitors', 'Unique visitors'],
                      ['avgTimeOnPage', 'Avg time on page (s)'],
                      ['bounceRate', 'Bounce rate'],
                      ['organicClicks', 'Organic clicks'],
                      ['impressions', 'Impressions'],
                      ['avgPosition', 'Avg position'],
                      ['ctr', 'CTR'],
                      ['socialShares', 'Social shares'],
                      ['backlinks', 'Backlinks'],
                      ['comments', 'Comments'],
                      ['signups', 'Signups'],
                      ['conversionRate', 'Conversion rate'],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-xs">{label}</Label>
                        <Input
                          type="number"
                          value={metricsForm[key]}
                          onChange={(e) =>
                            setMetricsForm({ ...metricsForm, [key]: e.target.value })
                          }
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                  <Button size="sm" onClick={handleLogMetrics} disabled={metricsSaving}>
                    {metricsSaving ? 'Saving...' : 'Log metrics'}
                  </Button>
                </div>
              )}

              {/* Snapshot expander */}
              {piece.metricSnapshots.length > 0 && (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllSnapshots(!showAllSnapshots)}
                  >
                    {showAllSnapshots ? 'Hide snapshots' : `View all snapshots (${piece.metricSnapshots.length})`}
                  </Button>

                  {showAllSnapshots && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1.5 pr-3 font-medium">Date</th>
                            <th className="text-right py-1.5 px-2 font-medium">PV</th>
                            <th className="text-right py-1.5 px-2 font-medium">UV</th>
                            <th className="text-right py-1.5 px-2 font-medium">Clicks</th>
                            <th className="text-right py-1.5 px-2 font-medium">Pos</th>
                            <th className="text-right py-1.5 px-2 font-medium">Signups</th>
                            <th className="text-left py-1.5 pl-2 font-medium">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {piece.metricSnapshots.map((s) => (
                            <tr key={s.id} className="border-b last:border-0">
                              <td className="py-1.5 pr-3">{formatDate(s.snapshotDate)}</td>
                              <td className="text-right py-1.5 px-2">{formatNumber(s.pageviews)}</td>
                              <td className="text-right py-1.5 px-2">{formatNumber(s.uniqueVisitors)}</td>
                              <td className="text-right py-1.5 px-2">{formatNumber(s.organicClicks)}</td>
                              <td className="text-right py-1.5 px-2">{formatDecimal(s.avgPosition)}</td>
                              <td className="text-right py-1.5 px-2">{formatNumber(s.signups)}</td>
                              <td className="py-1.5 pl-2">{s.source}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Status */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={piece.status}
                onValueChange={handleStatusChange}
                disabled={statusUpdating}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Type:</span>{' '}
                <span className="font-medium">
                  {CONTENT_TYPE_LABELS[piece.contentType as ContentType] ?? piece.contentType}
                </span>
              </div>

              {piece.campaign && (
                <div>
                  <span className="text-muted-foreground">Campaign:</span>{' '}
                  <Link
                    href={`/campaigns/${piece.campaign.id}`}
                    className="font-medium hover:underline"
                  >
                    {piece.campaign.name}
                  </Link>
                </div>
              )}

              <div>
                <span className="text-muted-foreground">Published:</span>{' '}
                {editingPublishedAt ? (
                  <span className="inline-flex items-center gap-1">
                    <Input
                      type="date"
                      value={publishedAtInput}
                      onChange={(e) => setPublishedAtInput(e.target.value)}
                      className="h-7 text-xs w-36"
                    />
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handlePublishedAtSave}>
                      Save
                    </Button>
                  </span>
                ) : (
                  <span className="font-medium">
                    {piece.publishedAt ? formatDate(piece.publishedAt) : 'Not published'}
                    <button
                      type="button"
                      className="ml-1 text-xs text-muted-foreground hover:underline"
                      onClick={() => {
                        setEditingPublishedAt(true);
                        setPublishedAtInput(
                          piece.publishedAt
                            ? new Date(piece.publishedAt).toISOString().split('T')[0]
                            : ''
                        );
                      }}
                    >
                      Edit
                    </button>
                  </span>
                )}
              </div>

              <div>
                <span className="text-muted-foreground">Created by:</span>{' '}
                <span className="font-medium font-mono text-xs">
                  {piece.createdBy.slice(0, 8)}...
                </span>
              </div>

              <div>
                <span className="text-muted-foreground">Created:</span>{' '}
                <span className="font-medium">{formatDateTime(piece.createdAt)}</span>
              </div>

              <div>
                <span className="text-muted-foreground">Updated:</span>{' '}
                <span className="font-medium">{formatDateTime(piece.updatedAt)}</span>
              </div>

              {/* Slug with copy */}
              <div>
                <span className="text-muted-foreground">Slug:</span>{' '}
                <span className="font-mono text-xs">{piece.slug}</span>
                <button
                  type="button"
                  className="ml-1 text-xs text-muted-foreground hover:underline"
                  onClick={() => copyToClipboard(piece.slug, setSlugCopied)}
                >
                  {slugCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Public API URL */}
              <div>
                <span className="text-muted-foreground">Public API:</span>{' '}
                <span className="font-mono text-xs break-all">{publicApiUrl}</span>
                <button
                  type="button"
                  className="ml-1 text-xs text-muted-foreground hover:underline"
                  onClick={() => copyToClipboard(publicApiUrl, setApiUrlCopied)}
                >
                  {apiUrlCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
