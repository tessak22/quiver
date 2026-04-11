import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { toggleQuoteFeatured } from '@/lib/db/research';

export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const quote = await toggleQuoteFeatured(params.id);
    return NextResponse.json({ quote });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to toggle quote';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
