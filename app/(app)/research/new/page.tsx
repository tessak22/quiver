'use client';
// Client component: form inputs with state, async submission, and redirect on success.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
import type { ResearchSourceType, ContactStage } from '@/types';
import {
  RESEARCH_SOURCE_LABELS,
  CONTACT_STAGE_LABELS,
  CONTACT_STAGES,
} from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_SOURCE_TYPES: ResearchSourceType[] = [
  'call', 'interview', 'survey', 'review', 'forum',
  'support_ticket', 'social', 'common_room', 'other',
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewResearchEntryPage() {
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<ResearchSourceType>('call');
  const [contactName, setContactName] = useState('');
  const [contactCompany, setContactCompany] = useState('');
  const [contactSegment, setContactSegment] = useState('');
  const [contactStage, setContactStage] = useState<ContactStage | ''>('');
  const [researchDate, setResearchDate] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [rawNotes, setRawNotes] = useState('');
  const [productSignal, setProductSignal] = useState(false);
  const [productNote, setProductNote] = useState('');

  // UI state
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch campaigns for dropdown
  useEffect(() => {
    async function fetchCampaigns() {
      try {
        const res = await fetch('/api/campaigns');
        if (res.ok) {
          const data = await res.json() as { campaigns: CampaignOption[] };
          setCampaigns(data.campaigns);
        }
      } catch {
        // Campaign dropdown is non-critical; silently fail
      }
    }
    fetchCampaigns();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!rawNotes.trim()) {
      setError('Raw notes are required');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          sourceType,
          contactName: contactName.trim() || undefined,
          contactCompany: contactCompany.trim() || undefined,
          contactSegment: contactSegment.trim() || undefined,
          contactStage: contactStage || undefined,
          researchDate: researchDate || undefined,
          campaignId: campaignId || undefined,
          rawNotes: rawNotes.trim(),
          productSignal,
          productNote: productSignal ? productNote.trim() || undefined : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? 'Failed to create entry');
      }

      const data = await res.json() as { entry: { id: string } };
      router.push(`/research/${data.entry.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create entry');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/research">Back</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Research Entry</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Log a customer call, interview, survey response, or other research.
        </p>
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

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div className="grid gap-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Call with [Company] — [Date]"
                required
              />
            </div>

            {/* Source type */}
            <div className="grid gap-2">
              <Label htmlFor="sourceType">Source type</Label>
              <Select
                value={sourceType}
                onValueChange={(v) => setSourceType(v as ResearchSourceType)}
              >
                <SelectTrigger id="sourceType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_SOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {RESEARCH_SOURCE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="contactName">Contact name</Label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contactCompany">Contact company</Label>
                <Input
                  id="contactCompany"
                  value={contactCompany}
                  onChange={(e) => setContactCompany(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="contactSegment">ICP segment</Label>
                <Input
                  id="contactSegment"
                  value={contactSegment}
                  onChange={(e) => setContactSegment(e.target.value)}
                  placeholder="e.g. Enterprise, Mid-market, SMB"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="contactStage">Contact stage</Label>
                <Select
                  value={contactStage || 'none'}
                  onValueChange={(v) => setContactStage(v === 'none' ? '' : v as ContactStage)}
                >
                  <SelectTrigger id="contactStage">
                    <SelectValue placeholder="Select stage" />
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

            {/* Date and campaign */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="researchDate">Research date</Label>
                <Input
                  id="researchDate"
                  type="date"
                  value={researchDate}
                  onChange={(e) => setResearchDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign">Campaign</Label>
                <Select
                  value={campaignId || 'none'}
                  onValueChange={(v) => setCampaignId(v === 'none' ? '' : v)}
                >
                  <SelectTrigger id="campaign">
                    <SelectValue placeholder="No campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No campaign</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Raw notes */}
            <div className="grid gap-2">
              <Label htmlFor="rawNotes">Raw notes *</Label>
              <Textarea
                id="rawNotes"
                value={rawNotes}
                onChange={(e) => setRawNotes(e.target.value)}
                rows={12}
                placeholder="Paste your call notes, interview transcript, survey responses, or other raw research here..."
                required
              />
            </div>

            {/* Product signal */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={productSignal}
                  onChange={(e) => setProductSignal(e.target.checked)}
                  className="rounded border-input h-4 w-4"
                />
                <span className="text-sm font-medium">Product signal</span>
                <span className="text-xs text-muted-foreground">
                  Flag for product team follow-up
                </span>
              </label>

              {productSignal && (
                <div className="grid gap-2 pl-6">
                  <Label htmlFor="productNote">Product note</Label>
                  <Textarea
                    id="productNote"
                    value={productNote}
                    onChange={(e) => setProductNote(e.target.value)}
                    rows={3}
                    placeholder="What should the product team know about this?"
                  />
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/research')}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Entry'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
