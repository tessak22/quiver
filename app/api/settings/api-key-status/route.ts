import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

export async function GET() {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const key = process.env.ANTHROPIC_API_KEY;
  const isSet = !!key && key.length > 10;

  // Return a masked hint (first 7 + last 4 chars) so the UI can confirm which key
  let hint: string | null = null;
  if (isSet) {
    hint = key.substring(0, 7) + '...' + key.substring(key.length - 4);
  }

  return NextResponse.json({ isSet, hint });
}
