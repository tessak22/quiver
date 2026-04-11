import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  const isSet = !!key && key.length > 10;

  // Return a masked hint (first 7 + last 4 chars) so the UI can confirm which key
  let hint: string | null = null;
  if (isSet) {
    hint = key.substring(0, 7) + '...' + key.substring(key.length - 4);
  }

  return NextResponse.json({ isSet, hint });
}
