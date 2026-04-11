import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getCampaign,
  updateCampaign,
  archiveCampaign,
  getCampaignSessions,
  getCampaignArtifacts,
  getCampaignPerformanceLogs,
} from '@/lib/db/campaigns';
import { CAMPAIGN_STATUSES, CAMPAIGN_PRIORITIES } from '@/types';
import type { CampaignStatus } from '@/types';

// Valid status transitions: from -> allowed next states
const STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  planning: ['active', 'archived'],
  active: ['paused', 'complete', 'archived'],
  paused: ['active', 'complete', 'archived'],
  complete: ['archived'],
  archived: [],
};

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const campaign = await getCampaign(params.id);
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  // Check if related data tabs are requested
  const url = new URL(request.url);
  const include = url.searchParams.get('include');

  if (include === 'sessions') {
    const sessions = await getCampaignSessions(params.id);
    return NextResponse.json({ campaign, sessions });
  }

  if (include === 'artifacts') {
    const artifacts = await getCampaignArtifacts(params.id);
    return NextResponse.json({ campaign, artifacts });
  }

  if (include === 'performance') {
    const performanceLogs = await getCampaignPerformanceLogs(params.id);
    return NextResponse.json({ campaign, performanceLogs });
  }

  return NextResponse.json({ campaign });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const existing = await getCampaign(params.id);
  if (!existing) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Validate name if provided
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'Campaign name cannot be empty' }, { status: 400 });
    }
    body.name = body.name.trim();
  }

  // Validate and enforce status transitions
  if (body.status !== undefined) {
    if (!CAMPAIGN_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid campaign status' }, { status: 400 });
    }

    const currentStatus = existing.status as CampaignStatus;
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus];
    if (!allowedTransitions.includes(body.status)) {
      return NextResponse.json(
        {
          error: `Cannot transition from "${currentStatus}" to "${body.status}". Allowed: ${allowedTransitions.join(', ') || 'none'}`,
        },
        { status: 400 }
      );
    }
  }

  // Validate priority if provided
  if (body.priority !== undefined && !CAMPAIGN_PRIORITIES.includes(body.priority)) {
    return NextResponse.json({ error: 'Invalid campaign priority' }, { status: 400 });
  }

  // Validate links if provided
  if (body.links !== undefined) {
    if (body.links !== null && !Array.isArray(body.links)) {
      return NextResponse.json({ error: 'Links must be an array' }, { status: 400 });
    }
    if (Array.isArray(body.links)) {
      for (const link of body.links) {
        if (
          typeof link !== 'object' ||
          link === null ||
          typeof link.label !== 'string' ||
          typeof link.url !== 'string' ||
          !link.label.trim() ||
          !link.url.trim()
        ) {
          return NextResponse.json(
            { error: 'Each link must have a non-empty label and url' },
            { status: 400 }
          );
        }
      }
    }
  }

  const campaign = await updateCampaign(params.id, {
    name: body.name,
    description: body.description,
    goal: body.goal,
    channels: body.channels,
    status: body.status,
    priority: body.priority,
    startDate: body.startDate,
    endDate: body.endDate,
    ownerId: body.ownerId,
    links: body.links,
  });

  return NextResponse.json({ campaign });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const existing = await getCampaign(params.id);
  if (!existing) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  const campaign = await archiveCampaign(params.id);
  return NextResponse.json({ campaign });
}
