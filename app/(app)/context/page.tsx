'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompetitorEntry {
  name: string;
  notes: string;
}

interface ContextVersionRecord {
  id: string;
  version: number;
  isActive: boolean;
  positioningStatement: string | null;
  icpDefinition: unknown;
  messagingPillars: unknown;
  competitiveLandscape: unknown;
  customerLanguage: unknown;
  proofPoints: unknown;
  activeHypotheses: unknown;
  brandVoice: string | null;
  wordsToUse: string[];
  wordsToAvoid: string[];
  updatedBy: string | null;
  updateSource: string | null;
  changeSummary: string | null;
  createdAt: string;
}

interface ContextFormData {
  positioningStatement: string;
  icpDefinition: string;
  messagingPillars: string;
  competitiveLandscape: CompetitorEntry[];
  customerLanguage: string;
  proofPoints: string;
  activeHypotheses: string;
  brandVoice: string;
  wordsToUse: string[];
  wordsToAvoid: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

function safeJsonString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function parseCompetitors(value: unknown): CompetitorEntry[] {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'object' && item !== null && 'name' in item) {
        const record = item as Record<string, unknown>;
        return {
          name: String(record.name ?? ''),
          notes: String(record.notes ?? record.positioning ?? ''),
        };
      }
      return { name: String(item ?? ''), notes: '' };
    });
  }
  return [];
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function recordToFormData(record: ContextVersionRecord): ContextFormData {
  return {
    positioningStatement: record.positioningStatement ?? '',
    icpDefinition: safeJsonString(record.icpDefinition),
    messagingPillars: safeJsonString(record.messagingPillars),
    competitiveLandscape: parseCompetitors(record.competitiveLandscape),
    customerLanguage: safeJsonString(record.customerLanguage),
    proofPoints: safeJsonString(record.proofPoints),
    activeHypotheses: safeJsonString(record.activeHypotheses),
    brandVoice: record.brandVoice ?? '',
    wordsToUse: parseStringArray(record.wordsToUse),
    wordsToAvoid: parseStringArray(record.wordsToAvoid),
  };
}

const EMPTY_FORM: ContextFormData = {
  positioningStatement: '',
  icpDefinition: '',
  messagingPillars: '',
  competitiveLandscape: [],
  customerLanguage: '',
  proofPoints: '',
  activeHypotheses: '',
  brandVoice: '',
  wordsToUse: [],
  wordsToAvoid: [],
};

// Which sections count toward completeness
const SECTION_LABELS: { key: keyof ContextFormData; label: string }[] = [
  { key: 'positioningStatement', label: 'Positioning Statement' },
  { key: 'icpDefinition', label: 'ICP Definition' },
  { key: 'messagingPillars', label: 'Messaging Pillars' },
  { key: 'competitiveLandscape', label: 'Competitive Landscape' },
  { key: 'customerLanguage', label: 'Customer Language' },
  { key: 'proofPoints', label: 'Proof Points' },
  { key: 'activeHypotheses', label: 'Active Hypotheses' },
  { key: 'brandVoice', label: 'Brand Voice' },
  { key: 'wordsToUse', label: 'Words to Use' },
  { key: 'wordsToAvoid', label: 'Words to Avoid' },
];

function isSectionFilled(form: ContextFormData, key: keyof ContextFormData): boolean {
  const v = form[key];
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim().length > 0;
  return false;
}

// ---------------------------------------------------------------------------
// Tag Input Component
// ---------------------------------------------------------------------------

function TagInput({
  value,
  onChange,
  placeholder,
  id,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');

  function addTags(raw: string) {
    const tags = raw
      .split(/[,\n]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !value.includes(t));
    if (tags.length > 0) {
      onChange([...value, ...tags]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTags(input);
      setInput('');
    }
    if (e.key === 'Backspace' && input === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function handleBlur() {
    if (input.trim()) {
      addTags(input);
      setInput('');
    }
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          {!disabled && (
            <button
              type="button"
              className="ml-0.5 rounded-sm hover:bg-muted"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
            >
              x
            </button>
          )}
        </Badge>
      ))}
      <input
        id={id}
        type="text"
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground min-w-[120px] disabled:cursor-not-allowed disabled:opacity-50"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : ''}
        disabled={disabled}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Competitive Landscape Editor
// ---------------------------------------------------------------------------

function CompetitorEditor({
  value,
  onChange,
  disabled,
}: {
  value: CompetitorEntry[];
  onChange: (next: CompetitorEntry[]) => void;
  disabled?: boolean;
}) {
  function updateEntry(index: number, field: keyof CompetitorEntry, text: string) {
    const copy = value.map((e, i) =>
      i === index ? { ...e, [field]: text } : e
    );
    onChange(copy);
  }

  function addEntry() {
    onChange([...value, { name: '', notes: '' }]);
  }

  function removeEntry(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {value.map((entry, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 space-y-1">
            <Input
              placeholder="Competitor name"
              value={entry.name}
              onChange={(e) => updateEntry(i, 'name', e.target.value)}
              disabled={disabled}
            />
            <Textarea
              placeholder="Notes, differentiators, positioning..."
              value={entry.notes}
              onChange={(e) => updateEntry(i, 'notes', e.target.value)}
              rows={2}
              disabled={disabled}
            />
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 text-muted-foreground hover:text-destructive"
              onClick={() => removeEntry(i)}
            >
              Remove
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={addEntry}>
          + Add Competitor
        </Button>
      )}
      {value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No competitors added yet.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context Completeness Indicator
// ---------------------------------------------------------------------------

function CompletenessIndicator({ form }: { form: ContextFormData }) {
  const filled = SECTION_LABELS.filter((s) => isSectionFilled(form, s.key));
  const total = SECTION_LABELS.length;
  const pct = Math.round((filled.length / total) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Context Completeness</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span>
            {filled.length} of {total} sections
          </span>
          <span className="font-medium">{pct}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="space-y-1">
          {SECTION_LABELS.map((s) => {
            const done = isSectionFilled(form, s.key);
            return (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span
                  className={
                    done ? 'text-primary' : 'text-muted-foreground'
                  }
                >
                  {done ? '\u2713' : '\u2014'}
                </span>
                <span
                  className={
                    done ? '' : 'text-muted-foreground'
                  }
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Version History Panel
// ---------------------------------------------------------------------------

function VersionHistoryPanel({
  versions,
  activeId,
  viewingId,
  onView,
  onRestore,
  restoring,
}: {
  versions: ContextVersionRecord[];
  activeId: string | null;
  viewingId: string | null;
  onView: (v: ContextVersionRecord) => void;
  onRestore: (id: string) => void;
  restoring: boolean;
}) {
  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No version history yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => {
        const isActive = v.id === activeId;
        const isViewing = v.id === viewingId;

        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onView(v)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              isViewing
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">
                Version {v.version}
              </span>
              {isActive && (
                <Badge variant="default" className="text-xs">
                  Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatDate(v.createdAt)}
            </p>
            {v.changeSummary && (
              <p className="text-sm mt-1 line-clamp-2">
                {v.changeSummary}
              </p>
            )}
            {v.updateSource && (
              <Badge variant="outline" className="mt-1.5 text-xs">
                {v.updateSource}
              </Badge>
            )}
            {!isActive && (
              <div className="mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={restoring}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore(v.id);
                  }}
                >
                  Restore
                </Button>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ContextEditorPage() {
  // Data state
  const [activeVersion, setActiveVersion] = useState<ContextVersionRecord | null>(null);
  const [versions, setVersions] = useState<ContextVersionRecord[]>([]);
  const [viewingVersion, setViewingVersion] = useState<ContextVersionRecord | null>(null);

  // Form state
  const [form, setForm] = useState<ContextFormData>(EMPTY_FORM);
  const [isDirty, setIsDirty] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [changeSummary, setChangeSummary] = useState('');

  // ------ Data fetching ------

  const fetchActive = useCallback(async () => {
    const res = await fetch('/api/context');
    if (res.ok) {
      const data: { context: ContextVersionRecord } = await res.json();
      setActiveVersion(data.context);
      setForm(recordToFormData(data.context));
      setViewingVersion(null);
      setIsDirty(false);
    } else if (res.status !== 404) {
      setError('Failed to load context');
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    const res = await fetch('/api/context?history=true');
    if (res.ok) {
      const data: { versions: ContextVersionRecord[] } = await res.json();
      setVersions(data.versions);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchActive(), fetchHistory()]);
      setLoading(false);
    }
    init();
  }, [fetchActive, fetchHistory]);

  // ------ Form helpers ------

  function updateField<K extends keyof ContextFormData>(
    key: K,
    value: ContextFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  }

  function handleViewVersion(v: ContextVersionRecord) {
    setViewingVersion(v);
    setForm(recordToFormData(v));
    setIsDirty(false);
  }

  function handleBackToActive() {
    if (activeVersion) {
      setForm(recordToFormData(activeVersion));
    } else {
      setForm(EMPTY_FORM);
    }
    setViewingVersion(null);
    setIsDirty(false);
  }

  // ------ Save ------

  function openSaveDialog() {
    setChangeSummary('');
    setSaveDialogOpen(true);
  }

  async function handleSave() {
    if (!changeSummary.trim()) return;

    setSaving(true);
    setError(null);

    // Parse JSON fields back for the API
    let icpDefinition: unknown = undefined;
    if (form.icpDefinition.trim()) {
      try {
        icpDefinition = JSON.parse(form.icpDefinition);
      } catch {
        icpDefinition = form.icpDefinition;
      }
    }

    let messagingPillars: unknown = undefined;
    if (form.messagingPillars.trim()) {
      // Try JSON first, fall back to lines
      try {
        messagingPillars = JSON.parse(form.messagingPillars);
      } catch {
        messagingPillars = form.messagingPillars
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
      }
    }

    let customerLanguage: unknown = undefined;
    if (form.customerLanguage.trim()) {
      try {
        customerLanguage = JSON.parse(form.customerLanguage);
      } catch {
        customerLanguage = form.customerLanguage;
      }
    }

    let proofPoints: unknown = undefined;
    if (form.proofPoints.trim()) {
      try {
        proofPoints = JSON.parse(form.proofPoints);
      } catch {
        proofPoints = form.proofPoints
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
      }
    }

    let activeHypotheses: unknown = undefined;
    if (form.activeHypotheses.trim()) {
      try {
        activeHypotheses = JSON.parse(form.activeHypotheses);
      } catch {
        activeHypotheses = form.activeHypotheses
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
      }
    }

    const payload = {
      positioningStatement: form.positioningStatement || null,
      icpDefinition,
      messagingPillars,
      competitiveLandscape:
        form.competitiveLandscape.length > 0
          ? form.competitiveLandscape
          : undefined,
      customerLanguage,
      proofPoints,
      activeHypotheses,
      brandVoice: form.brandVoice || null,
      wordsToUse: form.wordsToUse,
      wordsToAvoid: form.wordsToAvoid,
      updateSource: 'manual',
      changeSummary: changeSummary.trim(),
    };

    try {
      const res = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Save failed');
      }

      setSaveDialogOpen(false);
      await Promise.all([fetchActive(), fetchHistory()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ------ Restore ------

  async function handleRestore(id: string) {
    setRestoring(true);
    setError(null);

    try {
      const res = await fetch(`/api/context/${id}/restore`, { method: 'POST' });
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Restore failed');
      }

      await Promise.all([fetchActive(), fetchHistory()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  }

  // ------ Render helpers ------

  const isViewingHistorical =
    viewingVersion !== null && viewingVersion.id !== activeVersion?.id;
  const filledCount = SECTION_LABELS.filter((s) =>
    isSectionFilled(form, s.key)
  ).length;

  // ------ Loading state ------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading context...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Product Marketing Context
          </h1>
          {activeVersion && (
            <p className="text-sm text-muted-foreground mt-1">
              Version {activeVersion.version} — last updated{' '}
              {formatDate(activeVersion.createdAt)}
              {activeVersion.updatedBy && ` by ${activeVersion.updatedBy}`}
            </p>
          )}
          {!activeVersion && (
            <p className="text-sm text-muted-foreground mt-1">
              No context created yet. Fill in the fields below and save.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {filledCount}/{SECTION_LABELS.length} sections
          </Badge>
          {isDirty && (
            <Badge variant="secondary">Unsaved changes</Badge>
          )}
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

      {/* Historical version banner */}
      {isViewingHistorical && (
        <div className="rounded-md border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-3 flex items-center justify-between gap-3">
          <p className="text-sm">
            Viewing version {viewingVersion.version} (read-only).{' '}
            {viewingVersion.changeSummary}
          </p>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleBackToActive}>
              Back to Active
            </Button>
            <Button
              size="sm"
              disabled={restoring}
              onClick={() => handleRestore(viewingVersion.id)}
            >
              {restoring ? 'Restoring...' : 'Restore This Version'}
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      <Tabs defaultValue="editor" className="space-y-4">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="history">
            History ({versions.length})
          </TabsTrigger>
        </TabsList>

        {/* ---- Editor Tab ---- */}
        <TabsContent value="editor">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* Editor Fields */}
            <div className="space-y-6">
              {/* Positioning Statement */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Positioning Statement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="positioning" className="sr-only">
                    Positioning Statement
                  </Label>
                  <Textarea
                    id="positioning"
                    placeholder="For [target customer] who [need], [product] is a [category] that [key benefit]. Unlike [alternative], we [key differentiator]."
                    value={form.positioningStatement}
                    onChange={(e) =>
                      updateField('positioningStatement', e.target.value)
                    }
                    rows={4}
                    disabled={isViewingHistorical}
                  />
                </CardContent>
              </Card>

              {/* ICP Definition */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">ICP Definition</CardTitle>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="icp" className="sr-only">
                    ICP Definition
                  </Label>
                  <Textarea
                    id="icp"
                    placeholder='{"role": "Marketing Manager", "company_size": "50-200", "industry": "SaaS", ...}'
                    value={form.icpDefinition}
                    onChange={(e) =>
                      updateField('icpDefinition', e.target.value)
                    }
                    rows={6}
                    className="font-mono text-sm"
                    disabled={isViewingHistorical}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    JSON format recommended. Free text also accepted.
                  </p>
                </CardContent>
              </Card>

              {/* Messaging Pillars */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Messaging Pillars
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="pillars" className="sr-only">
                    Messaging Pillars
                  </Label>
                  <Textarea
                    id="pillars"
                    placeholder="One pillar per line, or JSON array"
                    value={form.messagingPillars}
                    onChange={(e) =>
                      updateField('messagingPillars', e.target.value)
                    }
                    rows={5}
                    disabled={isViewingHistorical}
                  />
                </CardContent>
              </Card>

              {/* Competitive Landscape */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Competitive Landscape
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CompetitorEditor
                    value={form.competitiveLandscape}
                    onChange={(v) => updateField('competitiveLandscape', v)}
                    disabled={isViewingHistorical}
                  />
                </CardContent>
              </Card>

              {/* Customer Language */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Customer Language
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="language" className="sr-only">
                    Customer Language
                  </Label>
                  <Textarea
                    id="language"
                    placeholder="Paste customer verbatims, phrases, and terminology they actually use..."
                    value={form.customerLanguage}
                    onChange={(e) =>
                      updateField('customerLanguage', e.target.value)
                    }
                    rows={5}
                    disabled={isViewingHistorical}
                  />
                </CardContent>
              </Card>

              {/* Proof Points */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Proof Points</CardTitle>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="proofpoints" className="sr-only">
                    Proof Points
                  </Label>
                  <Textarea
                    id="proofpoints"
                    placeholder="Key stats, case studies, testimonials, awards..."
                    value={form.proofPoints}
                    onChange={(e) =>
                      updateField('proofPoints', e.target.value)
                    }
                    rows={5}
                    disabled={isViewingHistorical}
                  />
                </CardContent>
              </Card>

              {/* Active Hypotheses */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Active Hypotheses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="hypotheses" className="sr-only">
                    Active Hypotheses
                  </Label>
                  <Textarea
                    id="hypotheses"
                    placeholder="Current marketing hypotheses you are testing..."
                    value={form.activeHypotheses}
                    onChange={(e) =>
                      updateField('activeHypotheses', e.target.value)
                    }
                    rows={4}
                    disabled={isViewingHistorical}
                  />
                </CardContent>
              </Card>

              {/* Brand Voice */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Brand Voice</CardTitle>
                </CardHeader>
                <CardContent>
                  <Label htmlFor="brandvoice" className="sr-only">
                    Brand Voice
                  </Label>
                  <Textarea
                    id="brandvoice"
                    placeholder="Describe your brand voice: tone, personality, style guidelines..."
                    value={form.brandVoice}
                    onChange={(e) =>
                      updateField('brandVoice', e.target.value)
                    }
                    rows={4}
                    disabled={isViewingHistorical}
                  />
                </CardContent>
              </Card>

              {/* Words to Use / Avoid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Words to Use</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Label htmlFor="wordsuse" className="sr-only">
                      Words to Use
                    </Label>
                    <TagInput
                      id="wordsuse"
                      value={form.wordsToUse}
                      onChange={(v) => updateField('wordsToUse', v)}
                      placeholder="Type a word and press Enter or comma..."
                      disabled={isViewingHistorical}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">
                      Words to Avoid
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Label htmlFor="wordsavoid" className="sr-only">
                      Words to Avoid
                    </Label>
                    <TagInput
                      id="wordsavoid"
                      value={form.wordsToAvoid}
                      onChange={(v) => updateField('wordsToAvoid', v)}
                      placeholder="Type a word and press Enter or comma..."
                      disabled={isViewingHistorical}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Save Button */}
              {!isViewingHistorical && (
                <div className="flex justify-end">
                  <Button
                    size="lg"
                    disabled={!isDirty || saving}
                    onClick={openSaveDialog}
                  >
                    {saving ? 'Saving...' : 'Save New Version'}
                  </Button>
                </div>
              )}
            </div>

            {/* Sidebar — Completeness */}
            <aside className="hidden lg:block space-y-6">
              <CompletenessIndicator form={form} />
            </aside>
          </div>
        </TabsContent>

        {/* ---- History Tab ---- */}
        <TabsContent value="history">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Version History</CardTitle>
              </CardHeader>
              <CardContent>
                <VersionHistoryPanel
                  versions={versions}
                  activeId={activeVersion?.id ?? null}
                  viewingId={viewingVersion?.id ?? null}
                  onView={handleViewVersion}
                  onRestore={handleRestore}
                  restoring={restoring}
                />
              </CardContent>
            </Card>

            <aside className="hidden lg:block space-y-6">
              <CompletenessIndicator form={form} />
            </aside>
          </div>
        </TabsContent>
      </Tabs>

      {/* Mobile Completeness -- visible only on small screens */}
      <div className="lg:hidden">
        <Separator className="my-4" />
        <CompletenessIndicator form={form} />
      </div>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Context Version</DialogTitle>
            <DialogDescription>
              Describe what changed in this version. This helps track the
              evolution of your marketing context over time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="changeSummary">What changed?</Label>
            <Textarea
              id="changeSummary"
              placeholder="e.g., Updated positioning to emphasize enterprise features..."
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.metaKey && changeSummary.trim()) {
                  handleSave();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!changeSummary.trim() || saving}
            >
              {saving ? 'Saving...' : 'Save Version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
