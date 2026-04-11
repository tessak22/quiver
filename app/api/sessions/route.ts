import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSessions } from '@/lib/db/sessions';
import type { SessionMode } from '@/types';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') as SessionMode | null;
  const campaignId = url.searchParams.get('campaignId');
  const archived = url.searchParams.get('archived') === 'true';

  const sessions = await getSessions({
    mode: mode ?? undefined,
    campaignId: campaignId ?? undefined,
    isArchived: archived,
  });

  return NextResponse.json({ sessions });
}
