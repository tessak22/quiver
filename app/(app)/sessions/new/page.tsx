'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SessionMode, ArtifactType } from '@/types';

// ---------------------------------------------------------------------------
// Mode definitions
// ---------------------------------------------------------------------------

interface ModeOption {
  value: SessionMode;
  label: string;
  description: string;
}

const MODES: ModeOption[] = [
  {
    value: 'strategy',
    label: 'Strategy',
    description: 'Get structured strategic recommendations grounded in your product context and marketing frameworks.',
  },
  {
    value: 'create',
    label: 'Create',
    description: 'Produce complete, production-ready marketing copy for emails, landing pages, ads, and more.',
  },
  {
    value: 'feedback',
    label: 'Feedback',
    description: 'Synthesize customer research, feedback data, and propose updates to your product marketing context.',
  },
  {
    value: 'analyze',
    label: 'Analyze',
    description: 'Interpret data against your product context and connect findings to ICP segments and channels.',
  },
  {
    value: 'optimize',
    label: 'Optimize',
    description: 'Critique existing copy and pages against your positioning and ICP, then produce improved versions.',
  },
];

// Artifact types available in create mode
interface ArtifactOption {
  value: ArtifactType;
  label: string;
}

const ARTIFACT_TYPES: ArtifactOption[] = [
  { value: 'copywriting', label: 'Copywriting' },
  { value: 'email_sequence', label: 'Email Sequence' },
  { value: 'cold_email', label: 'Cold Email' },
  { value: 'social_content', label: 'Social Content' },
  { value: 'ad_creative', label: 'Ad Creative' },
  { value: 'landing_page', label: 'Landing Page' },
  { value: 'one_pager', label: 'One Pager' },
  { value: 'positioning', label: 'Positioning' },
  { value: 'messaging', label: 'Messaging' },
  { value: 'content_strategy', label: 'Content Strategy' },
  { value: 'ab_test', label: 'A/B Test' },
  { value: 'launch_strategy', label: 'Launch Strategy' },
  { value: 'competitor_analysis', label: 'Competitor Analysis' },
  { value: 'seo', label: 'SEO' },
  { value: 'cro', label: 'CRO' },
  { value: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Campaign type
// ---------------------------------------------------------------------------

interface CampaignRecord {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewSessionPage() {
  const router = useRouter();

  const [selectedMode, setSelectedMode] = useState<SessionMode | null>(null);
  const [artifactType, setArtifactType] = useState<ArtifactType | undefined>(undefined);
  const [campaignId, setCampaignId] = useState<string | undefined>(undefined);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [starting, setStarting] = useState(false);

  // Fetch campaigns for the optional selector
  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/campaigns');
      if (res.ok) {
        const data: { campaigns: CampaignRecord[] } = await res.json();
        setCampaigns(data.campaigns);
      }
    } catch {
      // Campaign list is optional — silently ignore failures
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const canStart = selectedMode !== null && (selectedMode !== 'create' || artifactType !== undefined);

  function handleStartSession() {
    if (!canStart || !selectedMode) return;
    setStarting(true);

    // Navigate to the chat page with query params for a new session
    const params = new URLSearchParams();
    params.set('mode', selectedMode);
    if (artifactType) params.set('artifactType', artifactType);
    if (campaignId) params.set('campaignId', campaignId);

    router.push(`/sessions/new-chat?${params.toString()}`);
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Session</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a mode and configure your AI session.
        </p>
      </div>

      {/* Mode Selector */}
      <div className="space-y-3">
        <Label className="text-base font-medium">Session Mode</Label>
        <div className="grid grid-cols-1 gap-3">
          {MODES.map((mode) => {
            const isSelected = selectedMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => {
                  setSelectedMode(mode.value);
                  if (mode.value !== 'create') {
                    setArtifactType(undefined);
                  }
                }}
                className={`w-full text-left rounded-lg border p-4 transition-colors ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{mode.label}</span>
                  {isSelected && (
                    <Badge variant="default" className="text-xs">
                      Selected
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {mode.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Artifact Type — shown only in create mode */}
      {selectedMode === 'create' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Artifact Type</CardTitle>
            <CardDescription>
              What type of content are you creating?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={artifactType ?? ''}
              onValueChange={(value) => setArtifactType(value as ArtifactType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select artifact type..." />
              </SelectTrigger>
              <SelectContent>
                {ARTIFACT_TYPES.map((at) => (
                  <SelectItem key={at.value} value={at.value}>
                    {at.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Campaign Selector — optional */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Campaign (optional)</CardTitle>
          <CardDescription>
            Link this session to a campaign for better organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCampaigns ? (
            <p className="text-sm text-muted-foreground">Loading campaigns...</p>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No campaigns found. You can create one later.
            </p>
          ) : (
            <Select
              value={campaignId ?? ''}
              onValueChange={(value) =>
                setCampaignId(value === '' ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="No campaign selected" />
              </SelectTrigger>
              <SelectContent>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Start Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={!canStart || starting}
          onClick={handleStartSession}
        >
          {starting ? 'Starting...' : 'Start Session'}
        </Button>
      </div>
    </div>
  );
}
