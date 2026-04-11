import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createArtifact, getArtifacts } from '@/lib/db/artifacts';
import { getDefaultCampaign } from '@/lib/db/campaigns';
import { getActiveContext } from '@/lib/db/context';

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

  if (!body.title || !body.type || !body.content) {
    return NextResponse.json(
      { error: 'Title, type, and content are required' },
      { status: 400 }
    );
  }

  // If no campaign specified, use the default campaign
  let campaignId = body.campaignId;
  if (!campaignId) {
    const unassigned = await getDefaultCampaign();
    if (unassigned) {
      campaignId = unassigned.id;
    } else {
      return NextResponse.json(
        { error: 'No campaign available. Create a campaign first.' },
        { status: 400 }
      );
    }
  }

  // Get active context version
  const activeContext = await getActiveContext();

  const artifact = await createArtifact({
    title: body.title,
    type: body.type,
    content: body.content,
    skillUsed: body.skillUsed,
    campaignId,
    sessionId: body.sessionId,
    contextVersionId: activeContext?.id,
    tags: body.tags ?? [],
    createdBy: user.id,
  });

  return NextResponse.json({ artifact });
}

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const campaignId = url.searchParams.get('campaignId');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');

  const artifacts = await getArtifacts({
    type: type ?? undefined,
    campaignId: campaignId ?? undefined,
    status: status ?? undefined,
    search: search ?? undefined,
  });

  return NextResponse.json({ artifacts });
}
