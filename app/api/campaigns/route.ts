import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCampaigns, createCampaign } from '@/lib/db/campaigns';
import { CAMPAIGN_STATUSES, CAMPAIGN_PRIORITIES } from '@/types';
import type { CampaignStatus } from '@/types';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status') as CampaignStatus | null;

  if (status && !CAMPAIGN_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 });
  }

  const campaigns = await getCampaigns({
    status: status ?? undefined,
  });

  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Validate required fields
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
  }

  // Validate status if provided
  if (body.status && !CAMPAIGN_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid campaign status' }, { status: 400 });
  }

  // Validate priority if provided
  if (body.priority && !CAMPAIGN_PRIORITIES.includes(body.priority)) {
    return NextResponse.json({ error: 'Invalid campaign priority' }, { status: 400 });
  }

  const campaign = await createCampaign({
    name: body.name.trim(),
    description: body.description ?? undefined,
    goal: body.goal ?? undefined,
    channels: body.channels ?? [],
    status: body.status ?? 'planning',
    priority: body.priority ?? 'medium',
    startDate: body.startDate ?? undefined,
    endDate: body.endDate ?? undefined,
    ownerId: body.ownerId ?? undefined,
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
