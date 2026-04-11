'use client';
// Client component: interactive filters, tabs, toggle actions, and async data fetching.

import { useCallback, useEffect, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  ResearchSourceType,
  ContactStage,
  ResearchTheme,
  ResearchSentiment,
} from '@/types';
import {
  RESEARCH_SOURCE_LABELS,
  CONTACT_STAGE_LABELS,
  RESEARCH_THEMES,
} from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResearchEntryRecord {
  id: string;
  title: string;
  sourceType: string;
  contactName: string | null;
  contactCompany: string | null;
  contactSegment: string | null;
  contactStage: string | null;
  researchDate: string | null;
  summary: string | null;
  themes: string[];
  sentiment: string | null;
  productSignal: boolean;
  createdAt: string;
  campaign: { id: string; name: string } | null;
  _count: { quotes: number };
}

interface QuoteRecord {
  id: string;
  quote: string;
  context: string | null;
  theme: string | null;
  segment: string | null;
  isFeatured: boolean;
  createdAt: string;
  entry: {
    id: string;
    title: string;
    sourceType: string;
    researchDate: string | null;
  };
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

const ALL_SOURCE_TYPES: ResearchSourceType[] = [
  'call', 'interview', 'survey', 'review', 'forum',
  'support_ticket', 'social', 'common_room', 'other',
];

const ALL_STAGES: ContactStage[] = ['prospect', 'customer', 'churned', 'never_converted'];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

// ---------------------------------------------------------------------------
// Entries Tab
// ---------------------------------------------------------------------------

function EntriesTab() {
  const [entries, setEntries] = useState<ResearchEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [segmentFilter, setSegmentFilter] = useState<string>('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [productSignalOnly, setProductSignalOnly] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (sourceFilter !== 'all') params.set('sourceType', sourceFilter);
      if (segmentFilter.trim()) params.set('segment', segmentFilter.trim());
      if (stageFilter !== 'all') params.set('stage', stageFilter);
      if (themeFilter !== 'all') params.set('theme', themeFilter);
      if (productSignalOnly) params.set('productSignal', 'true');

      const res = await fetch(`/api/research?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to load entries');
      }

      const data = await res.json() as { entries: ResearchEntryRecord[] };
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entries');
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, segmentFilter, stageFilter, themeFilter, productSignalOnly]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={sourceFilter}
          onValueChange={setSourceFilter}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {ALL_SOURCE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {RESEARCH_SOURCE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={stageFilter}
          onValueChange={setStageFilter}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {ALL_STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {CONTACT_STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="text"
          placeholder="Filter by segment..."
          value={segmentFilter}
          onChange={(e) => setSegmentFilter(e.target.value)}
          className="w-[160px]"
        />

        <Select
          value={themeFilter}
          onValueChange={setThemeFilter}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All themes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All themes</SelectItem>
            {RESEARCH_THEMES.map((t) => (
              <SelectItem key={t} value={t}>
                {THEME_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={() => setProductSignalOnly(!productSignalOnly)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors ${
            productSignalOnly
              ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
              : 'border-input bg-background text-muted-foreground hover:bg-muted'
          }`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${productSignalOnly ? 'bg-amber-500' : 'bg-gray-300'}`} />
          Product signal
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-muted-foreground">Loading entries...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-lg font-medium">No research entries yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Add your first customer call, interview, or survey response.
            </p>
            <Button asChild className="mt-4">
              <Link href="/research/new">+ New Entry</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Entry card grid */}
      {!loading && entries.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((entry) => {
            const sourceType = entry.sourceType as ResearchSourceType;
            const sentiment = (entry.sentiment ?? 'neutral') as ResearchSentiment;

            return (
              <Link
                key={entry.id}
                href={`/research/${entry.id}`}
                className="block"
              >
                <Card className="transition-colors hover:bg-muted/50 h-full">
                  <CardContent className="p-5 flex flex-col gap-3 h-full">
                    {/* Top row: source type badge + sentiment dot */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          SOURCE_TYPE_COLORS[sourceType] ?? SOURCE_TYPE_COLORS.other
                        }`}
                      >
                        {RESEARCH_SOURCE_LABELS[sourceType] ?? entry.sourceType}
                      </span>
                      <div className="flex items-center gap-2">
                        {entry.productSignal && (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500"
                            title="Product signal"
                          />
                        )}
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${SENTIMENT_DOT[sentiment]}`}
                          title={SENTIMENT_LABEL[sentiment]}
                        />
                      </div>
                    </div>

                    {/* Title */}
                    <p className="font-medium leading-snug line-clamp-2">
                      {entry.title}
                    </p>

                    {/* Contact info */}
                    {(entry.contactName || entry.contactCompany) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[entry.contactName, entry.contactCompany].filter(Boolean).join(' — ')}
                      </p>
                    )}

                    {/* Segment badge */}
                    {entry.contactSegment && (
                      <Badge variant="secondary" className="text-xs w-fit">
                        {entry.contactSegment}
                      </Badge>
                    )}

                    {/* Themes */}
                    {entry.themes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {entry.themes.map((theme) => (
                          <span
                            key={theme}
                            className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            {THEME_LABELS[theme as ResearchTheme] ?? theme}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Bottom row: campaign + date */}
                    <div className="flex items-center justify-between gap-2 mt-auto pt-2">
                      {entry.campaign && (
                        <span className="text-xs text-muted-foreground truncate">
                          {entry.campaign.name}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {entry.researchDate
                          ? formatDate(entry.researchDate)
                          : formatDate(entry.createdAt)}
                      </span>
                    </div>
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

// ---------------------------------------------------------------------------
// Quotes Tab (VoC Library)
// ---------------------------------------------------------------------------

function QuotesTab() {
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Filters
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [segmentFilter, setSegmentFilter] = useState<string>('');

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (themeFilter !== 'all') params.set('theme', themeFilter);
      if (segmentFilter.trim()) params.set('segment', segmentFilter.trim());

      const res = await fetch(`/api/research/quotes?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to load quotes');
      }

      const data = await res.json() as { quotes: QuoteRecord[] };
      setQuotes(data.quotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quotes');
    } finally {
      setLoading(false);
    }
  }, [themeFilter, segmentFilter]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  async function handleToggleFeatured(quoteId: string) {
    setTogglingId(quoteId);
    try {
      const res = await fetch(`/api/research/quotes/${quoteId}`, {
        method: 'PATCH',
      });
      if (res.ok) {
        const data = await res.json() as { quote: { id: string; isFeatured: boolean } };
        setQuotes((prev) =>
          prev.map((q) =>
            q.id === quoteId ? { ...q, isFeatured: data.quote.isFeatured } : q
          )
        );
      }
    } catch {
      // Toggle is non-critical; silently fail
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={themeFilter}
          onValueChange={setThemeFilter}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All themes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All themes</SelectItem>
            {RESEARCH_THEMES.map((t) => (
              <SelectItem key={t} value={t}>
                {THEME_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="text"
          placeholder="Filter by segment..."
          value={segmentFilter}
          onChange={(e) => setSegmentFilter(e.target.value)}
          className="w-[160px]"
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-muted-foreground">Loading quotes...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && quotes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-lg font-medium">No quotes yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Quotes are extracted automatically when you save a research entry.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quotes list */}
      {!loading && quotes.length > 0 && (
        <div className="space-y-2">
          {quotes.map((quote) => (
            <Card
              key={quote.id}
              className={
                quote.isFeatured
                  ? 'border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20'
                  : ''
              }
            >
              <CardContent className="flex items-start gap-4 py-3 px-4">
                {/* Star toggle */}
                <button
                  type="button"
                  disabled={togglingId === quote.id}
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

                {/* Quote content */}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm italic leading-relaxed">
                    &ldquo;{quote.quote}&rdquo;
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {quote.theme && (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5">
                        {THEME_LABELS[quote.theme as ResearchTheme] ?? quote.theme}
                      </span>
                    )}
                    {quote.segment && (
                      <Badge variant="secondary" className="text-xs">
                        {quote.segment}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {quote.entry.title}
                      {quote.entry.researchDate && ` — ${formatDate(quote.entry.researchDate)}`}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ResearchPage() {
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Research</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Customer calls, interviews, surveys, and extracted insights.
          </p>
        </div>
        <Button asChild>
          <Link href="/research/new">+ New Entry</Link>
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="entries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="quotes">Quotes</TabsTrigger>
        </TabsList>

        <TabsContent value="entries">
          <EntriesTab />
        </TabsContent>

        <TabsContent value="quotes">
          <QuotesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
