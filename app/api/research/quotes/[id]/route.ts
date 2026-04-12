import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/utils';
import { toggleQuoteFeatured } from '@/lib/db/research';

export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const quote = await toggleQuoteFeatured(params.id);
    return NextResponse.json({ quote });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to toggle quote') },
      { status: 404 }
    );
  }
}
