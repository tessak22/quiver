import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/utils';
import { getResearchQuotes } from '@/lib/db/research';

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch quotes') },
      { status: 500 }
    );
  }
}
