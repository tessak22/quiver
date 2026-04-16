import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import { getCampaigns, createCampaign } from '@/lib/db/campaigns';
import { CAMPAIGN_STATUSES, CAMPAIGN_PRIORITIES } from '@/types';
import type { CampaignStatus, CampaignPriority } from '@/types';

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const status = url.searchParams.get('status') as CampaignStatus | null;
  const includeArchived = url.searchParams.get('includeArchived') === 'true';
  const excludeArchived = !includeArchived && !status;

  if (status && !CAMPAIGN_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
  }

  try {
    const campaigns = await getCampaigns({
      status: status ?? undefined,
      excludeArchived,
    });

    return NextResponse.json({ campaigns });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch campaigns') },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: body, error } = await parseJsonBody(request);
  if (error) return error;

  // Validate required fields
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
  }

  // Validate status if provided
  if (body.status && !CAMPAIGN_STATUSES.includes(body.status as CampaignStatus)) {
    return NextResponse.json({ error: 'Invalid campaign status' }, { status: 400 });
  }

  // Validate priority if provided
  if (body.priority && !CAMPAIGN_PRIORITIES.includes(body.priority as CampaignPriority)) {
    return NextResponse.json({ error: 'Invalid campaign priority' }, { status: 400 });
  }

  // Validate date fields if provided
  if (body.startDate !== undefined) {
    const parsed = parseISODate(body.startDate);
    if (!parsed) return NextResponse.json({ error: 'Invalid startDate format. Use ISO 8601 (e.g. 2026-04-11).' }, { status: 400 });
    body.startDate = parsed.toISOString();
  }
  if (body.endDate !== undefined) {
    const parsed = parseISODate(body.endDate);
    if (!parsed) return NextResponse.json({ error: 'Invalid endDate format. Use ISO 8601 (e.g. 2026-04-11).' }, { status: 400 });
    body.endDate = parsed.toISOString();
  }

  try {
    const campaign = await createCampaign({
      name: (body.name as string).trim(),
      description: body.description as string | undefined ?? undefined,
      goal: body.goal as string | undefined ?? undefined,
      channels: (body.channels as string[]) ?? [],
      status: (body.status as CampaignStatus) ?? 'planning',
      priority: (body.priority as CampaignPriority) ?? 'medium',
      startDate: body.startDate as string | undefined ?? undefined,
      endDate: body.endDate as string | undefined ?? undefined,
      ownerId: body.ownerId as string | undefined ?? undefined,
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create campaign') },
      { status: 500 }
    );
  }
}
