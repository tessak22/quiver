import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReminders } from '@/lib/db/artifacts';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const reminders = await getReminders();
  return NextResponse.json({ reminders });
}
