import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createArtifact, getArtifacts } from '@/lib/db/artifacts';
import { getDefaultCampaign } from '@/lib/db/campaigns';
import { getActiveContext } from '@/lib/db/context';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  if (!body.title || !body.type || !body.content) {
    return NextResponse.json(
      { error: 'Title, type, and content are required' },
      { status: 400 }
    );
  }

  try {
    // If no campaign specified, use the default campaign
    let campaignId = body.campaignId as string | undefined;
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
      title: body.title as string,
      type: body.type as string,
      content: body.content as string,
      skillUsed: body.skillUsed as string | undefined,
      campaignId,
      sessionId: body.sessionId as string | undefined,
      contextVersionId: activeContext?.id,
      tags: (body.tags as string[]) ?? [],
      createdBy: auth.id,
    });

    return NextResponse.json({ artifact }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create artifact') },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const campaignId = url.searchParams.get('campaignId');
  const status = url.searchParams.get('status');
  const search = url.searchParams.get('search');
  const includeArchived = url.searchParams.get('includeArchived') === 'true';
  const excludeArchived = !includeArchived && !status;

  try {
    const artifacts = await getArtifacts({
      type: type ?? undefined,
      campaignId: campaignId ?? undefined,
      status: status ?? undefined,
      search: search ?? undefined,
      excludeArchived,
    });

    return NextResponse.json({ artifacts });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch artifacts') },
      { status: 500 }
    );
  }
}
