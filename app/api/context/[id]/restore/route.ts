import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { restoreContextVersion } from '@/lib/db/context';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const version = await restoreContextVersion(params.id, auth.id);
    return NextResponse.json({ version });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to restore version';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
