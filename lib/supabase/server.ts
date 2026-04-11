import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch (error) {
            // setAll is called from Server Components where cookies can't be set.
            // Safe to ignore when middleware refreshes sessions, but log for debugging.
            if (process.env.NODE_ENV === 'development') {
              console.warn('[supabase/server] Cookie setAll failed:', error);
            }
          }
        },
      },
    }
  );
}
