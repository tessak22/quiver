'use client';

// Client component: artifact creation page.
// Reads sessionId, type, and title from URL search params (set by ArtifactSaveBanner).
// Fetches session messages to pre-fill content, lets the user edit, and saves via POST /api/artifacts.

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
import type { ArtifactType } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CampaignOption {
  id: string;
  name: string;
}

interface ChatMessage {
  role: string;
  content: string;
}

interface SessionData {
  id: string;
  title: string | null;
  campaignId: string | null;
  messages: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARTIFACT_TYPE_OPTIONS: { value: ArtifactType; label: string }[] = [
  { value: 'copywriting', label: 'Copywriting' },
  { value: 'email_sequence', label: 'Email Sequence' },
  { value: 'cold_email', label: 'Cold Email' },
  { value: 'social_content', label: 'Social Content' },
  { value: 'launch_strategy', label: 'Launch Strategy' },
  { value: 'content_strategy', label: 'Content Strategy' },
  { value: 'positioning', label: 'Positioning' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'ad_creative', label: 'Ad Creative' },
  { value: 'competitor_analysis', label: 'Competitor Analysis' },
  { value: 'seo', label: 'SEO' },
  { value: 'cro', label: 'CRO' },
  { value: 'ab_test', label: 'A/B Test' },
  { value: 'landing_page', label: 'Landing Page' },
  { value: 'one_pager', label: 'One Pager' },
  { value: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractLastAssistantMessage(messages: unknown): string {
  if (!Array.isArray(messages)) return '';
  const assistantMessages = messages.filter(
    (m): m is ChatMessage =>
      typeof m === 'object' &&
      m !== null &&
      'role' in m &&
      'content' in m &&
      (m as ChatMessage).role === 'assistant' &&
      typeof (m as ChatMessage).content === 'string'
  );
  if (assistantMessages.length === 0) return '';
  return assistantMessages[assistantMessages.length - 1].content;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewArtifactPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const paramSessionId = searchParams.get('sessionId') ?? '';
  const paramType = searchParams.get('type') ?? '';
  const paramTitle = searchParams.get('title') ?? '';

  // Form state
  const [title, setTitle] = useState(paramTitle);
  const [type, setType] = useState(paramType || 'other');
  const [content, setContent] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [sessionId] = useState(paramSessionId);

  // Data state
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch campaigns for the dropdown
  const fetchCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data: { campaigns: CampaignOption[] } = await res.json();
        setCampaigns(data.campaigns);
      }
    } catch {
      // Non-critical; dropdown will be empty
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  // Fetch session to extract the last assistant message as default content
  const fetchSession = useCallback(async (sid: string) => {
    setLoadingSession(true);
    try {
      const res = await fetch(`/api/sessions/${sid}`);
      if (res.ok) {
        const data: { session: SessionData } = await res.json();
        const lastMessage = extractLastAssistantMessage(data.session.messages);
        if (lastMessage) {
          setContent(lastMessage);
        }
        // Pre-select campaign from session if available
        if (data.session.campaignId) {
          setCampaignId(data.session.campaignId);
        }
      }
    } catch {
      // Non-critical; user can still fill in content manually
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    if (sessionId) {
      fetchSession(sessionId);
    }
  }, [sessionId, fetchSession]);

  // Save artifact
  async function handleSave() {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        type,
        content: content.trim(),
      };

      if (sessionId) {
        body.sessionId = sessionId;
      }
      if (campaignId) {
        body.campaignId = campaignId;
      }

      const res = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        throw new Error(data.error ?? 'Failed to save artifact');
      }

      const data: { artifact: { id: string } } = await res.json();
      router.push(`/artifacts/${data.artifact.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save artifact');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/artifacts" className="hover:underline">
          Artifacts
        </Link>
        <span>/</span>
        <span className="text-foreground">New Artifact</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Save Artifact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
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

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="artifact-title">Title *</Label>
            <Input
              id="artifact-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter artifact title"
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="artifact-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="artifact-type">
                <SelectValue placeholder="Select a type" />
              </SelectTrigger>
              <SelectContent>
                {ARTIFACT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Campaign */}
          <div className="space-y-2">
            <Label htmlFor="artifact-campaign">Campaign</Label>
            <Select
              value={campaignId || '__none__'}
              onValueChange={(v) => setCampaignId(v === '__none__' ? '' : v)}
              disabled={loadingCampaigns}
            >
              <SelectTrigger id="artifact-campaign">
                <SelectValue placeholder={loadingCampaigns ? 'Loading campaigns...' : 'Select a campaign'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No campaign</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="artifact-content">
              Content
              {loadingSession && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  Loading from session...
                </span>
              )}
            </Label>
            <Textarea
              id="artifact-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter or edit artifact content..."
              rows={12}
              disabled={loadingSession}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" asChild>
              <Link href={sessionId ? `/sessions/${sessionId}` : '/artifacts'}>
                Cancel
              </Link>
            </Button>
            <Button onClick={handleSave} disabled={saving || loadingSession}>
              {saving ? 'Saving...' : 'Save Artifact'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
