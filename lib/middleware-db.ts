/**
 * Edge-compatible DB helpers for middleware.
 *
 * What it does: Runs the two read-only queries the middleware needs
 *   (membership check, active-context check). Prisma's standard engine
 *   doesn't run on the Next.js Edge runtime, so middleware can't import
 *   `lib/db/*`. The backend is picked from `DATABASE_URL`:
 *   - Neon host (`*.neon.tech`): Neon's HTTP-based serverless driver.
 *   - Anything else (Supabase Postgres): Supabase PostgREST with the
 *     service role key. The Neon driver can't reach non-Neon hosts.
 *
 * What it reads from: `team_members.id`, `context_versions."isActive"` in
 *   the database at `DATABASE_URL`.
 *
 * Edge cases:
 *   - Connection pool: both backends use HTTP, so every query is an
 *     independent request — no pool, no long-lived connection.
 *   - `contextQueryFailed`: callers should treat a thrown error from
 *     `hasActiveContext` as query-failure (do not lock the user out).
 *     `isTeamMember` returns `false` on any error, matching prior behavior.
 */

import { neon } from '@neondatabase/serverless';
import { createClient } from '@supabase/supabase-js';

type SqlClient = ReturnType<typeof neon>;
type RestClient = ReturnType<typeof createClient>;

let cachedSql: SqlClient | null = null;
let cachedRest: RestClient | null = null;

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

function getSqlClient(): SqlClient {
  if (cachedSql) return cachedSql;
  cachedSql = neon(getDatabaseUrl());
  return cachedSql;
}

function getRestClient(): RestClient {
  if (cachedRest) return cachedRest;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  cachedRest = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedRest;
}

async function selectOneId(
  table: 'team_members' | 'context_versions',
  column: string,
  value: string | boolean
): Promise<boolean> {
  if (isNeonUrl(getDatabaseUrl())) {
    const sql = getSqlClient();
    const rows = (table === 'team_members'
      ? await sql`SELECT id FROM team_members WHERE id = ${value} LIMIT 1`
      : await sql`SELECT id FROM context_versions WHERE "isActive" = ${value} LIMIT 1`) as Array<{ id: string }>;
    return rows.length > 0;
  }

  const { data, error } = await getRestClient()
    .from(table)
    .select('id')
    .eq(column, value)
    .limit(1);
  if (error) throw new Error(`${error.code ?? 'rest_error'}: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function isTeamMember(userId: string): Promise<boolean> {
  try {
    return await selectOneId('team_members', 'id', userId);
  } catch (err) {
    // Log and fail closed (non-member), so the user lands on
    // /access-denied or /setup rather than silently bypassing auth.
    console.error('[middleware-db] isTeamMember query failed', err);
    return false;
  }
}

/**
 * Returns `{ exists, failed }`. `failed=true` signals the query errored so
 * the caller can distinguish "no active context" (legit first-run) from
 * "database unreachable" (don't redirect to /setup on a transient failure).
 */
export async function hasActiveContext(): Promise<{ exists: boolean; failed: boolean }> {
  try {
    return { exists: await selectOneId('context_versions', 'isActive', true), failed: false };
  } catch (err) {
    console.error('[middleware-db] hasActiveContext query failed', err);
    return { exists: false, failed: true };
  }
}
