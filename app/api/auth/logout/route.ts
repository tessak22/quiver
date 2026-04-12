import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getAppUrl } from '@/lib/env';

export async function POST() {
  const supabase = createClient();

  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('[auth/logout] Sign out failed', { error: err });
  }

  // Clear membership cache and onboarding cookies
  const response = NextResponse.redirect(new URL('/login', getAppUrl()));
  response.cookies.set('quiver_member', '', { path: '/', maxAge: 0 });
  response.cookies.set('quiver_onboarded', '', { path: '/', maxAge: 0 });

  return response;
}
