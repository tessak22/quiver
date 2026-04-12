import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

export async function GET() {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({ id: auth.id, role: auth.role });
}
