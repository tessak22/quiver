'use client';
// 'use client' — contains controlled Select/Input state and button click handlers

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ArtifactStatus } from '@/types';

const ALL_STATUSES: ArtifactStatus[] = [
  'draft',
  'review',
  'approved',
  'live',
  'archived',
];

const STATUS_LABELS: Record<ArtifactStatus, string> = {
  draft: 'Draft',
  review: 'Review',
  approved: 'Approved',
  live: 'Live',
  archived: 'Archived',
};

interface BulkActionBarProps {
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  campaigns: Array<{ id: string; name: string }>;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onExitSelectMode: () => void;
  onRequestAction: (
    action: 'status_change' | 'campaign_reassign' | 'add_tags' | 'remove_tags' | 'archive',
    params: Record<string, unknown>
  ) => void;
}

export function BulkActionBar({
  selectedCount,
  totalCount,
  isAllSelected,
  campaigns,
  onSelectAll,
  onDeselectAll,
  onExitSelectMode,
  onRequestAction,
}: BulkActionBarProps) {
  const [targetStatus, setTargetStatus] = useState<ArtifactStatus>('review');
  const [targetCampaign, setTargetCampaign] = useState('');
  const [tagInput, setTagInput] = useState('');

  const parsedTags = tagInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  const noneSelected = selectedCount === 0;

  return (
    <div className="sticky top-0 z-20 bg-background border-b shadow-sm py-3 px-4 md:px-6 lg:px-8 -mx-4 md:-mx-6 lg:-mx-8">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Selection count + controls */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-medium tabular-nums">
            {selectedCount} of {totalCount} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={isAllSelected ? onDeselectAll : onSelectAll}
          >
            {isAllSelected ? 'Deselect All' : 'Select All'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onExitSelectMode}>
            Cancel
          </Button>
        </div>

        <div className="hidden sm:block h-4 w-px bg-border shrink-0" aria-hidden />

        {/* Action controls */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Status change */}
          <div className="flex items-center gap-1.5">
            <Select
              value={targetStatus}
              onValueChange={(v) => setTargetStatus(v as ArtifactStatus)}
            >
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={noneSelected}
              onClick={() => onRequestAction('status_change', { targetStatus })}
            >
              Change Status
            </Button>
          </div>

          {/* Campaign reassign — only shown if campaigns loaded */}
          {campaigns.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Select value={targetCampaign} onValueChange={setTargetCampaign}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="Campaign…" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={noneSelected || !targetCampaign}
                onClick={() =>
                  onRequestAction('campaign_reassign', { campaignId: targetCampaign })
                }
              >
                Reassign
              </Button>
            </div>
          )}

          {/* Tag operations */}
          <div className="flex items-center gap-1.5">
            <Input
              placeholder="tag1, tag2…"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="w-[150px] h-8 text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={noneSelected || parsedTags.length === 0}
              onClick={() => onRequestAction('add_tags', { tags: parsedTags })}
            >
              Add Tags
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={noneSelected || parsedTags.length === 0}
              onClick={() => onRequestAction('remove_tags', { tags: parsedTags })}
            >
              Remove Tags
            </Button>
          </div>

          {/* Archive */}
          <Button
            size="sm"
            variant="destructive"
            className="h-8 text-xs"
            disabled={noneSelected}
            onClick={() => onRequestAction('archive', {})}
          >
            Archive
          </Button>
        </div>
      </div>
    </div>
  );
}
