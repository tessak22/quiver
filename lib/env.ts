import { createClient as createSupabaseClient } from '@supabase/supabase-js';

type SupabaseAdminClient = ReturnType<typeof createSupabaseClient>;

let adminClient: SupabaseAdminClient | null = null;

function readEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function getAppUrl(): string {
  return readEnv('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000';
}

export function getSupabaseAdminClient(): SupabaseAdminClient {
  const url = readEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for invite flows');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for invite flows');
  }

  if (!adminClient) {
    adminClient = createSupabaseClient(url, serviceRoleKey);
  }

  return adminClient;
}
