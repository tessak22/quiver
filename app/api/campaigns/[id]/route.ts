import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import {
  getCampaign,
  updateCampaign,
  deleteCampaign,
  CampaignNotEmptyError,
  getCampaignSessions,
  getCampaignArtifacts,
  getCampaignPerformanceLogs,
} from '@/lib/db/campaigns';
import { CAMPAIGN_STATUSES, CAMPAIGN_PRIORITIES } from '@/types';
import type { CampaignStatus, CampaignPriority } from '@/types';

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
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
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
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch campaign') },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const existing = await getCampaign(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { data: body, error } = await parseJsonBody(request);
    if (error) return error;

    // Validate name if provided
    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        return NextResponse.json({ error: 'Campaign name cannot be empty' }, { status: 400 });
      }
      body.name = body.name.trim();
    }

    // Validate and enforce status transitions
    if (body.status !== undefined) {
      if (!CAMPAIGN_STATUSES.includes(body.status as CampaignStatus)) {
        return NextResponse.json({ error: 'Invalid campaign status' }, { status: 400 });
      }

      const currentStatus = existing.status as CampaignStatus;
      const allowedTransitions = STATUS_TRANSITIONS[currentStatus];
      if (body.status !== currentStatus && !allowedTransitions.includes(body.status as CampaignStatus)) {
        return NextResponse.json(
          {
            error: `Cannot transition from "${currentStatus}" to "${body.status}". Allowed: ${allowedTransitions.join(', ') || 'none'}`,
          },
          { status: 400 }
        );
      }
    }

    // Validate priority if provided
    if (body.priority !== undefined && !CAMPAIGN_PRIORITIES.includes(body.priority as CampaignPriority)) {
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
            typeof (link as Record<string, unknown>).label !== 'string' ||
            typeof (link as Record<string, unknown>).url !== 'string' ||
            !(link as Record<string, unknown>).label ||
            !(link as Record<string, unknown>).url ||
            !(((link as Record<string, unknown>).label) as string).trim() ||
            !(((link as Record<string, unknown>).url) as string).trim()
          ) {
            return NextResponse.json(
              { error: 'Each link must have a non-empty label and url' },
              { status: 400 }
            );
          }
        }
      }
    }

    // Validate date fields if provided
    if (body.startDate !== undefined && body.startDate !== null) {
      const parsed = parseISODate(body.startDate);
      if (!parsed) return NextResponse.json({ error: 'Invalid startDate format. Use ISO 8601 (e.g. 2026-04-11).' }, { status: 400 });
      body.startDate = parsed.toISOString();
    }
    if (body.endDate !== undefined && body.endDate !== null) {
      const parsed = parseISODate(body.endDate);
      if (!parsed) return NextResponse.json({ error: 'Invalid endDate format. Use ISO 8601 (e.g. 2026-04-11).' }, { status: 400 });
      body.endDate = parsed.toISOString();
    }

    const campaign = await updateCampaign(params.id, {
      name: body.name as string | undefined,
      description: body.description as string | undefined,
      goal: body.goal as string | undefined,
      channels: body.channels as string[] | undefined,
      status: body.status as CampaignStatus | undefined,
      priority: body.priority as CampaignPriority | undefined,
      startDate: body.startDate as string | undefined,
      endDate: body.endDate as string | undefined,
      ownerId: body.ownerId as string | undefined,
      links: body.links as Array<{ label: string; url: string }> | undefined,
    });

    return NextResponse.json({ campaign });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update campaign') },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const existing = await getCampaign(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    await deleteCampaign(params.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof CampaignNotEmptyError) {
      return NextResponse.json(
        { error: err.message, counts: err.counts },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to delete campaign') },
      { status: 500 }
    );
  }
}
