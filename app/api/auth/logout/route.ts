import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = createClient();

  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('[auth/logout] Sign out failed:', err);
  }

  // Clear membership cache and onboarding cookies
  const response = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
  response.cookies.set('quiver_member', '', { path: '/', maxAge: 0 });
  response.cookies.set('quiver_onboarded', '', { path: '/', maxAge: 0 });

  return response;
}
