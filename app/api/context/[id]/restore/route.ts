import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { restoreContextVersion } from '@/lib/db/context';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const version = await restoreContextVersion(params.id, user.id);
    return NextResponse.json({ version });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore version';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
