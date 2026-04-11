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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PerformanceLogType, ContextUpdateProposal } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignOption {
  id: string;
  name: string;
}

interface ArtifactOption {
  id: string;
  title: string;
  type: string;
}

interface PerformanceLogRecord {
  id: string;
  artifactId: string | null;
  campaignId: string;
  logType: string;
  metrics: Record<string, unknown> | null;
  qualitativeNotes: string | null;
  whatWorked: string | null;
  whatDidnt: string | null;
  proposedContextUpdates: ContextUpdateProposal[] | null;
  contextUpdateStatus: string;
  recordedBy: string;
  recordedAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  artifact: { id: string; title: string; type: string } | null;
  campaign: { id: string; name: string };
}

interface MetricRow {
  key: string;
  value: string;
}

interface LogFormData {
  artifactId: string;
  campaignId: string;
  logType: PerformanceLogType;
  metrics: MetricRow[];
  qualitativeNotes: string;
  whatWorked: string;
  whatDidnt: string;
  periodStart: string;
  periodEnd: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
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

function metricsToRecord(rows: MetricRow[]): Record<string, unknown> | undefined {
  const filtered = rows.filter((r) => r.key.trim() && r.value.trim());
  if (filtered.length === 0) return undefined;

  const result: Record<string, unknown> = {};
  for (const row of filtered) {
    const num = Number(row.value);
    result[row.key.trim()] = isNaN(num) ? row.value.trim() : num;
  }
  return result;
}

function formatMetricValue(value: unknown): string {
  if (typeof value === 'number') {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
    }).format(value);
  }
  return String(value);
}

const LOG_TYPE_LABELS: Record<PerformanceLogType, string> = {
  artifact: 'Artifact',
  campaign: 'Campaign',
  channel: 'Channel',
  audience_segment: 'Audience Segment',
};

const EMPTY_FORM: LogFormData = {
  artifactId: '',
  campaignId: '',
  logType: 'artifact',
  metrics: [{ key: '', value: '' }],
  qualitativeNotes: '',
  whatWorked: '',
  whatDidnt: '',
  periodStart: '',
  periodEnd: '',
};

// ---------------------------------------------------------------------------
// Metric Row Editor
// ---------------------------------------------------------------------------

function MetricEditor({
  rows,
  onChange,
}: {
  rows: MetricRow[];
  onChange: (rows: MetricRow[]) => void;
}) {
  function updateRow(index: number, field: keyof MetricRow, value: string) {
    const copy = rows.map((r, i) =>
      i === index ? { ...r, [field]: value } : r
    );
    onChange(copy);
  }

  function addRow() {
    onChange([...rows, { key: '', value: '' }]);
  }

  function removeRow(index: number) {
    if (rows.length <= 1) {
      onChange([{ key: '', value: '' }]);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
        <span>Metric Name</span>
        <span>Value</span>
        <span className="w-16" />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            placeholder="e.g. open_rate"
            value={row.key}
            onChange={(e) => updateRow(i, 'key', e.target.value)}
          />
          <Input
            placeholder="e.g. 24.5"
            value={row.value}
            onChange={(e) => updateRow(i, 'value', e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive w-16"
            onClick={() => removeRow(i)}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        + Add Metric
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expandable Log Entry
// ---------------------------------------------------------------------------

function LogEntry({
  log,
  isExpanded,
  onToggle,
}: {
  log: PerformanceLogRecord;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const metrics = log.metrics as Record<string, unknown> | null;
  const metricKeys = metrics ? Object.keys(metrics) : [];
  const proposals = log.proposedContextUpdates;

  return (
    <Card>
      <button
        type="button"
        className="w-full text-left p-4 sm:p-6"
        onClick={onToggle}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">
                {log.artifact?.title || 'Campaign-level'}
              </span>
              <Badge variant="outline" className="text-xs">
                {LOG_TYPE_LABELS[log.logType as PerformanceLogType] || log.logType}
              </Badge>
              {proposals && proposals.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {proposals.length} proposed update{proposals.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {log.campaign.name}
              {log.periodStart && (
                <> &middot; {formatDate(log.periodStart)}
                  {log.periodEnd && <> to {formatDate(log.periodEnd)}</>}
                </>
              )}
            </p>
          </div>
          <div className="text-sm text-muted-foreground shrink-0">
            {formatDateTime(log.recordedAt)}
          </div>
        </div>

        {/* Summary metrics */}
        {metricKeys.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-3">
            {metricKeys.slice(0, 4).map((key) => (
              <div key={key} className="text-sm">
                <span className="text-muted-foreground">{key}:</span>{' '}
                <span className="font-medium">
                  {formatMetricValue(metrics![key])}
                </span>
              </div>
            ))}
            {metricKeys.length > 4 && (
              <span className="text-sm text-muted-foreground">
                +{metricKeys.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Quick preview of what worked / didn't */}
        {!isExpanded && (log.whatWorked || log.whatDidnt) && (
          <div className="flex flex-wrap gap-4 mt-2 text-sm">
            {log.whatWorked && (
              <span className="text-green-600 dark:text-green-400 line-clamp-1">
                Worked: {log.whatWorked}
              </span>
            )}
            {log.whatDidnt && (
              <span className="text-red-600 dark:text-red-400 line-clamp-1">
                Didn&apos;t work: {log.whatDidnt}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          <Separator />

          {/* Full metrics table */}
          {metricKeys.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Metrics</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {metricKeys.map((key) => (
                  <div key={key} className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">{key}</p>
                    <p className="text-sm font-medium">
                      {formatMetricValue(metrics![key])}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What worked / didn't */}
          {log.whatWorked && (
            <div>
              <h4 className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">
                What Worked
              </h4>
              <p className="text-sm whitespace-pre-wrap">{log.whatWorked}</p>
            </div>
          )}

          {log.whatDidnt && (
            <div>
              <h4 className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                What Didn&apos;t Work
              </h4>
              <p className="text-sm whitespace-pre-wrap">{log.whatDidnt}</p>
            </div>
          )}

          {/* Qualitative notes */}
          {log.qualitativeNotes && (
            <div>
              <h4 className="text-sm font-medium mb-1">Notes</h4>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {log.qualitativeNotes}
              </p>
            </div>
          )}

          {/* AI Synthesis — proposed context updates */}
          {proposals && proposals.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">
                AI-Proposed Context Updates
              </h4>
              <div className="space-y-2">
                {proposals.map((proposal, i) => (
                  <div
                    key={i}
                    className="rounded-md border p-3 space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {proposal.field}
                      </Badge>
                      <Badge
                        variant={
                          log.contextUpdateStatus === 'approved'
                            ? 'default'
                            : log.contextUpdateStatus === 'rejected'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="text-xs"
                      >
                        {log.contextUpdateStatus}
                      </Badge>
                    </div>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Current: </span>
                      {proposal.current}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Proposed: </span>
                      {proposal.proposed}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {proposal.rationale}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Period */}
          {(log.periodStart || log.periodEnd) && (
            <div className="text-xs text-muted-foreground">
              Period: {log.periodStart ? formatDate(log.periodStart) : 'Start'}
              {' to '}
              {log.periodEnd ? formatDate(log.periodEnd) : 'End'}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PerformancePage() {
  // Data state
  const [logs, setLogs] = useState<PerformanceLogRecord[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactOption[]>([]);

  // Form state
  const [form, setForm] = useState<LogFormData>(EMPTY_FORM);

  // Filter state
  const [filterCampaign, setFilterCampaign] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // ------ Data fetching ------

  const fetchLogs = useCallback(async (campaignId?: string) => {
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);

    const res = await fetch(`/api/performance?${params.toString()}`);
    if (res.ok) {
      const data: { logs: PerformanceLogRecord[] } = await res.json();
      setLogs(data.logs);
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch('/api/campaigns');
    if (res.ok) {
      const data: { campaigns: CampaignOption[] } = await res.json();
      setCampaigns(data.campaigns);
    }
  }, []);

  const fetchArtifacts = useCallback(async () => {
    const res = await fetch('/api/artifacts');
    if (res.ok) {
      const data: { artifacts: ArtifactOption[] } = await res.json();
      setArtifacts(data.artifacts);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchLogs(), fetchCampaigns(), fetchArtifacts()]);
      setLoading(false);
    }
    init();
  }, [fetchLogs, fetchCampaigns, fetchArtifacts]);

  // ------ Form helpers ------

  function updateField<K extends keyof LogFormData>(
    key: K,
    value: LogFormData[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!form.campaignId) {
      setError('Please select a campaign.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifactId: form.artifactId || undefined,
          campaignId: form.campaignId,
          logType: form.logType,
          metrics: metricsToRecord(form.metrics),
          qualitativeNotes: form.qualitativeNotes || undefined,
          whatWorked: form.whatWorked || undefined,
          whatDidnt: form.whatDidnt || undefined,
          periodStart: form.periodStart || undefined,
          periodEnd: form.periodEnd || undefined,
        }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to create log');
      }

      setForm(EMPTY_FORM);
      setSuccessMessage('Performance log saved. AI synthesis running in background.');
      await fetchLogs(filterCampaign || undefined);

      // Clear success message after a few seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save log');
    } finally {
      setSubmitting(false);
    }
  }

  // ------ Filter handler ------

  function handleFilterChange(campaignId: string) {
    const resolved = campaignId === '__all__' ? '' : campaignId;
    setFilterCampaign(resolved);
    fetchLogs(resolved || undefined);
  }

  // ------ Pattern report ------

  async function handleGenerateReport() {
    setError(null);
    setGeneratingReport(true);

    try {
      const res = await fetch('/api/performance/pattern-report', {
        method: 'POST',
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to generate report');
      }

      setSuccessMessage('Pattern report generated and saved as an artifact.');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setGeneratingReport(false);
    }
  }

  // ------ Toggle log expansion ------

  function toggleLog(id: string) {
    setExpandedLogId((prev) => (prev === id ? null : id));
  }

  // ------ Loading state ------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Loading performance data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Performance Tracking
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Log results, track what works, and let AI find patterns in your data.
          </p>
        </div>
        <Button
          onClick={handleGenerateReport}
          disabled={generatingReport || logs.length === 0}
          variant="outline"
        >
          {generatingReport ? 'Generating...' : 'Generate Pattern Report'}
        </Button>
      </div>

      {/* Error / Success banners */}
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

      {successMessage && (
        <div className="rounded-md border border-green-500/50 bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-700 dark:text-green-400">
          {successMessage}
        </div>
      )}

      <Tabs defaultValue="log" className="space-y-4">
        <TabsList>
          <TabsTrigger value="log">Log Results</TabsTrigger>
          <TabsTrigger value="history">
            History ({logs.length})
          </TabsTrigger>
        </TabsList>

        {/* ---- Log Entry Tab ---- */}
        <TabsContent value="log">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Log Performance Results</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Campaign + Log Type Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="campaign">Campaign *</Label>
                    <Select
                      value={form.campaignId}
                      onValueChange={(v) => updateField('campaignId', v)}
                    >
                      <SelectTrigger id="campaign">
                        <SelectValue placeholder="Select a campaign" />
                      </SelectTrigger>
                      <SelectContent>
                        {campaigns.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="logType">Log Type</Label>
                    <Select
                      value={form.logType}
                      onValueChange={(v) =>
                        updateField('logType', v as PerformanceLogType)
                      }
                    >
                      <SelectTrigger id="logType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.entries(LOG_TYPE_LABELS) as [
                            PerformanceLogType,
                            string,
                          ][]
                        ).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Artifact selector */}
                <div className="space-y-2">
                  <Label htmlFor="artifact">Artifact (optional)</Label>
                  <Select
                    value={form.artifactId}
                    onValueChange={(v) =>
                      updateField('artifactId', v === '__none__' ? '' : v)
                    }
                  >
                    <SelectTrigger id="artifact">
                      <SelectValue placeholder="No specific artifact" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        No specific artifact
                      </SelectItem>
                      {artifacts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.title} ({a.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Period */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="periodStart">Period Start</Label>
                    <Input
                      id="periodStart"
                      type="date"
                      value={form.periodStart}
                      onChange={(e) => updateField('periodStart', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="periodEnd">Period End</Label>
                    <Input
                      id="periodEnd"
                      type="date"
                      value={form.periodEnd}
                      onChange={(e) => updateField('periodEnd', e.target.value)}
                    />
                  </div>
                </div>

                {/* Metrics */}
                <div className="space-y-2">
                  <Label>Metrics</Label>
                  <MetricEditor
                    rows={form.metrics}
                    onChange={(rows) => updateField('metrics', rows)}
                  />
                </div>

                <Separator />

                {/* What worked */}
                <div className="space-y-2">
                  <Label htmlFor="whatWorked">What Worked</Label>
                  <Textarea
                    id="whatWorked"
                    placeholder="Describe what went well, what resonated with the audience..."
                    value={form.whatWorked}
                    onChange={(e) => updateField('whatWorked', e.target.value)}
                    rows={3}
                  />
                </div>

                {/* What didn't */}
                <div className="space-y-2">
                  <Label htmlFor="whatDidnt">What Didn&apos;t Work</Label>
                  <Textarea
                    id="whatDidnt"
                    placeholder="Describe what fell flat, missed expectations, or underperformed..."
                    value={form.whatDidnt}
                    onChange={(e) => updateField('whatDidnt', e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Qualitative Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional observations, context, or thoughts..."
                    value={form.qualitativeNotes}
                    onChange={(e) =>
                      updateField('qualitativeNotes', e.target.value)
                    }
                    rows={3}
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Saving...' : 'Save Performance Log'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- History Tab ---- */}
        <TabsContent value="history" className="space-y-4">
          {/* Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-64">
              <Select
                value={filterCampaign || '__all__'}
                onValueChange={handleFilterChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All campaigns</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Log list */}
          {logs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No performance data logged yet.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Switch to the &ldquo;Log Results&rdquo; tab to record your first result.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <LogEntry
                  key={log.id}
                  log={log}
                  isExpanded={expandedLogId === log.id}
                  onToggle={() => toggleLog(log.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
