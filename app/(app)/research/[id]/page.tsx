'use client';
// Client component: async data fetching, polling for AI processing, toggle/edit/delete actions.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  ResearchSourceType,
  ResearchSentiment,
  ResearchTheme,
  HypothesisSignal,
  ContactStage,
} from '@/types';
import {
  RESEARCH_SOURCE_LABELS,
  CONTACT_STAGE_LABELS,
  CONTACT_STAGES,
} from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuoteRecord {
  id: string;
  quote: string;
  context: string | null;
  theme: string | null;
  segment: string | null;
  isFeatured: boolean;
  createdAt: string;
}

interface HypothesisSignalRecord {
  hypothesis: string;
  signal: HypothesisSignal;
  evidence: string;
}

interface ResearchEntryDetail {
  id: string;
  title: string;
  sourceType: string;
  contactName: string | null;
  contactCompany: string | null;
  contactSegment: string | null;
  contactStage: string | null;
  researchDate: string | null;
  rawNotes: string;
  summary: string | null;
  themes: string[];
  sentiment: string | null;
  productSignal: boolean;
  productNote: string | null;
  hypothesisSignals: HypothesisSignalRecord[] | null;
  campaignId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  campaign: { id: string; name: string } | null;
  quotes: QuoteRecord[];
}

interface CampaignOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_TYPE_COLORS: Record<ResearchSourceType, string> = {
  call: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  interview: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  survey: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  review: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  forum: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  support_ticket: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  social: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  common_room: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  other: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
};

const SENTIMENT_DOT: Record<ResearchSentiment, string> = {
  positive: 'bg-green-500',
  negative: 'bg-red-500',
  neutral: 'bg-gray-400',
  mixed: 'bg-amber-500',
};

const SENTIMENT_LABEL: Record<ResearchSentiment, string> = {
  positive: 'Positive',
  negative: 'Negative',
  neutral: 'Neutral',
  mixed: 'Mixed',
};

const THEME_LABELS: Record<ResearchTheme, string> = {
  pricing: 'Pricing',
  onboarding: 'Onboarding',
  competitor_mention: 'Competitor',
  feature_gap: 'Feature gap',
  messaging: 'Messaging',
  icp_fit: 'ICP fit',
  other: 'Other',
};

const SIGNAL_COLORS: Record<HypothesisSignal, string> = {
  validates: 'text-green-700 dark:text-green-400',
  challenges: 'text-red-700 dark:text-red-400',
  neutral: 'text-gray-500 dark:text-gray-400',
};

const SIGNAL_LABELS: Record<HypothesisSignal, string> = {
  validates: 'Validates',
  challenges: 'Challenges',
  neutral: 'Neutral',
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

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

function formatDateTime(dateStr: string): string {
  return dateTimeFormatter.format(new Date(dateStr));
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResearchEntryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const entryId = params.id as string;

  const [entry, setEntry] = useState<ResearchEntryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawNotesExpanded, setRawNotesExpanded] = useState(false);
  const [togglingQuoteId, setTogglingQuoteId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    contactName: '',
    contactCompany: '',
    contactSegment: '',
    contactStage: '' as ContactStage | '',
    researchDate: '',
    productSignal: false,
    productNote: '',
    campaignId: '',
  });
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Linear dialog
  const [linearOpen, setLinearOpen] = useState(false);
  const [linearCopied, setLinearCopied] = useState(false);

  // Polling ref for AI processing
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch entry
  const fetchEntry = useCallback(async () => {
    try {
      const res = await fetch(`/api/research/${entryId}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to load entry');
      }
      const data = await res.json() as { entry: ResearchEntryDetail };
      setEntry(data.entry);

      // Stop polling if summary is now present
      if (data.entry.summary !== null && pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entry');
    }
  }, [entryId]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    fetchEntry().finally(() => setLoading(false));
  }, [fetchEntry]);

  // Start polling if summary is null (AI still processing)
  useEffect(() => {
    if (entry && entry.summary === null && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        fetchEntry();
      }, 3000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [entry, fetchEntry]);

  // Fetch campaigns when edit dialog opens
  useEffect(() => {
    if (!editOpen) return;
    fetch('/api/campaigns')
      .then((res) => res.json())
      .then((data: { campaigns: CampaignOption[] }) => setCampaigns(data.campaigns))
      .catch(() => {});
  }, [editOpen]);

  // Toggle quote featured
  async function handleToggleFeatured(quoteId: string) {
    setTogglingQuoteId(quoteId);
    try {
      const res = await fetch(`/api/research/quotes/${quoteId}`, {
        method: 'PATCH',
      });
      if (res.ok) {
        const data = await res.json() as { quote: { id: string; isFeatured: boolean } };
        setEntry((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            quotes: prev.quotes.map((q) =>
              q.id === quoteId ? { ...q, isFeatured: data.quote.isFeatured } : q
            ),
          };
        });
      }
    } catch {
      // Non-critical
    } finally {
      setTogglingQuoteId(null);
    }
  }

  // Copy quote to clipboard
  async function handleCopyQuote(quoteText: string, quoteId: string) {
    try {
      await navigator.clipboard.writeText(quoteText);
      setCopySuccess(quoteId);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }

  // Open edit dialog
  function openEditDialog() {
    if (!entry) return;
    setEditForm({
      title: entry.title,
      contactName: entry.contactName ?? '',
      contactCompany: entry.contactCompany ?? '',
      contactSegment: entry.contactSegment ?? '',
      contactStage: (entry.contactStage as ContactStage) ?? '',
      researchDate: entry.researchDate
        ? new Date(entry.researchDate).toISOString().split('T')[0]
        : '',
      productSignal: entry.productSignal,
      productNote: entry.productNote ?? '',
      campaignId: entry.campaignId ?? '',
    });
    setEditError(null);
    setEditOpen(true);
  }

  // Save edit
  async function handleEditSave() {
    if (!editForm.title.trim()) {
      setEditError('Title is required');
      return;
    }

    setEditSaving(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/research/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          contactName: editForm.contactName,
          contactCompany: editForm.contactCompany,
          contactSegment: editForm.contactSegment,
          contactStage: editForm.contactStage || undefined,
          researchDate: editForm.researchDate || undefined,
          productSignal: editForm.productSignal,
          productNote: editForm.productSignal ? editForm.productNote : '',
          campaignId: editForm.campaignId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to update entry');
      }

      // Refetch full entry to get updated relations
      await fetchEntry();
      setEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to update entry');
    } finally {
      setEditSaving(false);
    }
  }

  // Delete
  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/research/${entryId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to delete entry');
      }
      router.push('/research');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry');
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  // Build Linear payload
  function getLinearPayload(): { title: string; description: string } {
    if (!entry) return { title: '', description: '' };

    const lines = [
      `## Product Signal from Research`,
      '',
      `**Source:** ${RESEARCH_SOURCE_LABELS[entry.sourceType as ResearchSourceType] ?? entry.sourceType}`,
      `**Entry:** ${entry.title}`,
    ];

    if (entry.contactName) lines.push(`**Contact:** ${entry.contactName}`);
    if (entry.contactCompany) lines.push(`**Company:** ${entry.contactCompany}`);
    if (entry.contactSegment) lines.push(`**Segment:** ${entry.contactSegment}`);
    if (entry.researchDate) lines.push(`**Date:** ${formatDate(entry.researchDate)}`);

    lines.push('');

    if (entry.productNote) {
      lines.push(`### Product Note`);
      lines.push(entry.productNote);
      lines.push('');
    }

    if (entry.summary) {
      lines.push(`### AI Summary`);
      lines.push(entry.summary);
      lines.push('');
    }

    // Include relevant quotes
    const relevantQuotes = entry.quotes.filter(
      (q) => q.theme === 'feature_gap' || q.isFeatured
    );
    if (relevantQuotes.length > 0) {
      lines.push(`### Key Quotes`);
      for (const q of relevantQuotes) {
        lines.push(`> "${q.quote}"`);
        if (q.context) lines.push(`> _Context: ${q.context}_`);
        lines.push('');
      }
    }

    return {
      title: `[Research Signal] ${entry.productNote?.slice(0, 60) ?? entry.title}`,
      description: lines.join('\n'),
    };
  }

  async function handleCopyLinear() {
    const payload = getLinearPayload();
    const text = `Title: ${payload.title}\n\n${payload.description}`;
    try {
      await navigator.clipboard.writeText(text);
      setLinearCopied(true);
      setTimeout(() => setLinearCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading research entry...</p>
      </div>
    );
  }

  // --- Error / not found ---
  if (!entry) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-destructive">{error ?? 'Research entry not found'}</p>
        <Button asChild variant="outline">
          <Link href="/research">Back to Research</Link>
        </Button>
      </div>
    );
  }

  const sourceType = entry.sourceType as ResearchSourceType;
  const sentiment = (entry.sentiment ?? 'neutral') as ResearchSentiment;
  const hypothesisSignals = Array.isArray(entry.hypothesisSignals)
    ? (entry.hypothesisSignals as HypothesisSignalRecord[])
    : [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Back button */}
      <div className="flex items-center gap-3 mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/research">Back</Link>
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive mb-4">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Processing banner */}
      {entry.summary === null && (
        <div className="rounded-md border border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm text-blue-800 dark:text-blue-200 mb-4">
          AI is analyzing this entry... This usually takes 10-20 seconds.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Main content */}
        <div className="space-y-6 min-w-0">
          {/* Title and badges */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  SOURCE_TYPE_COLORS[sourceType] ?? SOURCE_TYPE_COLORS.other
                }`}
              >
                {RESEARCH_SOURCE_LABELS[sourceType] ?? entry.sourceType}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`inline-block h-2 w-2 rounded-full ${SENTIMENT_DOT[sentiment]}`} />
                {SENTIMENT_LABEL[sentiment]}
              </span>
              {entry.productSignal && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-300">
                  Product signal
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{entry.title}</h1>
            {(entry.contactName || entry.contactCompany) && (
              <p className="text-sm text-muted-foreground mt-1">
                {[entry.contactName, entry.contactCompany].filter(Boolean).join(' — ')}
                {entry.contactSegment && (
                  <Badge variant="secondary" className="text-xs ml-2">
                    {entry.contactSegment}
                  </Badge>
                )}
                {entry.contactStage && (
                  <span className="ml-2 text-xs">
                    ({CONTACT_STAGE_LABELS[entry.contactStage as ContactStage] ?? entry.contactStage})
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {entry.summary ? (
                <p className="text-sm leading-relaxed">{entry.summary}</p>
              ) : (
                <div className="space-y-2">
                  <div className="h-4 w-full rounded bg-muted animate-pulse" />
                  <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-5/6 rounded bg-muted animate-pulse" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Themes */}
          {entry.themes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {entry.themes.map((theme) => (
                <span
                  key={theme}
                  className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {THEME_LABELS[theme as ResearchTheme] ?? theme}
                </span>
              ))}
            </div>
          )}

          {/* Raw notes (collapsible) */}
          <Card>
            <CardHeader className="pb-3">
              <button
                type="button"
                className="flex items-center gap-2 text-left w-full"
                onClick={() => setRawNotesExpanded(!rawNotesExpanded)}
              >
                <CardTitle className="text-base">Raw Notes</CardTitle>
                <span className="text-xs text-muted-foreground ml-auto">
                  {rawNotesExpanded ? 'Collapse' : 'Expand'}
                </span>
              </button>
            </CardHeader>
            {rawNotesExpanded && (
              <CardContent>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans break-words">
                  {entry.rawNotes}
                </pre>
              </CardContent>
            )}
          </Card>

          {/* Hypothesis signals */}
          {hypothesisSignals.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Hypothesis Signals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-4 font-medium text-muted-foreground">Hypothesis</th>
                        <th className="pb-2 pr-4 font-medium text-muted-foreground">Signal</th>
                        <th className="pb-2 font-medium text-muted-foreground">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hypothesisSignals.map((hs, idx) => (
                        <tr key={idx} className="border-b last:border-0">
                          <td className="py-2 pr-4">{hs.hypothesis}</td>
                          <td className="py-2 pr-4">
                            <span className={`font-medium ${SIGNAL_COLORS[hs.signal]}`}>
                              {SIGNAL_LABELS[hs.signal]}
                            </span>
                          </td>
                          <td className="py-2 text-muted-foreground">{hs.evidence}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Extracted quotes */}
          {entry.quotes.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Extracted Quotes ({entry.quotes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {entry.quotes.map((quote) => (
                  <div
                    key={quote.id}
                    className={`flex items-start gap-3 border-b last:border-0 pb-3 last:pb-0 ${
                      quote.isFeatured ? 'bg-amber-50/50 dark:bg-amber-950/20 -mx-2 px-2 rounded' : ''
                    }`}
                  >
                    {/* Star toggle */}
                    <button
                      type="button"
                      disabled={togglingQuoteId === quote.id}
                      onClick={() => handleToggleFeatured(quote.id)}
                      className={`mt-0.5 shrink-0 text-lg leading-none transition-colors ${
                        quote.isFeatured
                          ? 'text-amber-500'
                          : 'text-gray-300 hover:text-amber-400 dark:text-gray-600'
                      }`}
                      title={quote.isFeatured ? 'Unstar' : 'Star as featured'}
                    >
                      {quote.isFeatured ? '\u2605' : '\u2606'}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm italic leading-relaxed">
                        &ldquo;{quote.quote}&rdquo;
                      </p>
                      {quote.context && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Context: {quote.context}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {quote.theme && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {THEME_LABELS[quote.theme as ResearchTheme] ?? quote.theme}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Copy button */}
                    <button
                      type="button"
                      onClick={() => handleCopyQuote(quote.quote, quote.id)}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy quote"
                    >
                      {copySuccess === quote.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
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
                onClick={openEditDialog}
              >
                Edit metadata
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                Delete entry
              </Button>
            </CardContent>
          </Card>

          {/* Product signal section */}
          {entry.productSignal && (
            <Card className="border-amber-300 dark:border-amber-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                  Product Signal
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {entry.productNote && (
                  <p className="text-sm">{entry.productNote}</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setLinearOpen(true)}
                >
                  Push to Linear
                </Button>
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
              {entry.campaign && (
                <div>
                  <span className="text-muted-foreground">Campaign:</span>{' '}
                  <Link
                    href={`/campaigns/${entry.campaign.id}`}
                    className="font-medium hover:underline"
                  >
                    {entry.campaign.name}
                  </Link>
                </div>
              )}

              <div>
                <span className="text-muted-foreground">Source:</span>{' '}
                <span className="font-medium">
                  {RESEARCH_SOURCE_LABELS[sourceType] ?? entry.sourceType}
                </span>
              </div>

              {entry.contactStage && (
                <div>
                  <span className="text-muted-foreground">Stage:</span>{' '}
                  <span className="font-medium">
                    {CONTACT_STAGE_LABELS[entry.contactStage as ContactStage] ?? entry.contactStage}
                  </span>
                </div>
              )}

              {entry.researchDate && (
                <div>
                  <span className="text-muted-foreground">Research date:</span>{' '}
                  <span className="font-medium">{formatDate(entry.researchDate)}</span>
                </div>
              )}

              <div>
                <span className="text-muted-foreground">Created by:</span>{' '}
                <span className="font-medium font-mono text-xs">
                  {entry.createdBy.slice(0, 8)}...
                </span>
              </div>

              <div>
                <span className="text-muted-foreground">Created:</span>{' '}
                <span className="font-medium">{formatDateTime(entry.createdAt)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Research Entry</DialogTitle>
            <DialogDescription>
              Update metadata for this research entry. Raw notes cannot be edited.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Title *</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-contactName">Contact name</Label>
                <Input
                  id="edit-contactName"
                  value={editForm.contactName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, contactName: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-contactCompany">Company</Label>
                <Input
                  id="edit-contactCompany"
                  value={editForm.contactCompany}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, contactCompany: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-segment">Segment</Label>
                <Input
                  id="edit-segment"
                  value={editForm.contactSegment}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, contactSegment: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-stage">Stage</Label>
                <Select
                  value={editForm.contactStage || 'none'}
                  onValueChange={(v) =>
                    setEditForm((prev) => ({ ...prev, contactStage: v === 'none' ? '' : v as ContactStage }))
                  }
                >
                  <SelectTrigger id="edit-stage">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not specified</SelectItem>
                    {CONTACT_STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {CONTACT_STAGE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-date">Research date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editForm.researchDate}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, researchDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-campaign">Campaign</Label>
                <Select
                  value={editForm.campaignId || 'none'}
                  onValueChange={(v) =>
                    setEditForm((prev) => ({ ...prev, campaignId: v === 'none' ? '' : v }))
                  }
                >
                  <SelectTrigger id="edit-campaign">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No campaign</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.productSignal}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, productSignal: e.target.checked }))}
                  className="rounded border-input h-4 w-4"
                />
                <span className="text-sm font-medium">Product signal</span>
              </label>
              {editForm.productSignal && (
                <div className="grid gap-2 pl-6">
                  <Label htmlFor="edit-productNote">Product note</Label>
                  <Textarea
                    id="edit-productNote"
                    value={editForm.productNote}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, productNote: e.target.value }))}
                    rows={3}
                  />
                </div>
              )}
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Research Entry</DialogTitle>
            <DialogDescription>
              This will permanently delete this entry and all extracted quotes. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Linear payload dialog */}
      <Dialog open={linearOpen} onOpenChange={setLinearOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Push to Linear</DialogTitle>
            <DialogDescription>
              Copy this pre-formatted payload and paste it into a new Linear issue.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md max-h-[400px] overflow-y-auto break-words">
              {(() => {
                const payload = getLinearPayload();
                return `Title: ${payload.title}\n\n${payload.description}`;
              })()}
            </pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinearOpen(false)}>
              Close
            </Button>
            <Button onClick={handleCopyLinear}>
              {linearCopied ? 'Copied!' : 'Copy for Linear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
