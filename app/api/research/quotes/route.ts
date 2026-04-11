import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getResearchQuotes } from '@/lib/db/research';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const theme = url.searchParams.get('theme');
    const segment = url.searchParams.get('segment');
    const isFeatured = url.searchParams.get('isFeatured');

    const quotes = await getResearchQuotes({
      theme: theme ?? undefined,
      segment: segment ?? undefined,
      isFeatured: isFeatured === 'true' ? true : undefined,
    });

    return NextResponse.json({ quotes });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch quotes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
