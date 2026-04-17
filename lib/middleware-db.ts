/**
 * Edge-compatible DB helpers for middleware.
 *
 * What it does: Runs the two read-only queries the middleware needs
 *   (membership check, active-context check) against Neon via its HTTP-based
 *   serverless driver. Prisma's standard engine doesn't run on the Next.js
 *   Edge runtime, so middleware can't import `lib/db/*`. Supabase PostgREST
 *   can't be used either because the app data lives in Neon, not Supabase.
 *
 * What it reads from: `team_members.id`, `context_versions."isActive"` in
 *   the Neon database at `DATABASE_URL`.
 *
 * Edge cases:
 *   - Connection pool: `@neondatabase/serverless` uses HTTP, so every query
 *     is an independent request — no pool, no long-lived connection.
 *   - `contextQueryFailed`: callers should treat a thrown error from
 *     `hasActiveContext` as query-failure (do not lock the user out).
 *     `isTeamMember` returns `false` on any error, matching prior behavior.
 */

import { neon } from '@neondatabase/serverless';

type SqlClient = ReturnType<typeof neon>;

let cached: SqlClient | null = null;

function getClient(): SqlClient {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  cached = neon(url);
  return cached;
}

export async function isTeamMember(userId: string): Promise<boolean> {
  try {
    const sql = getClient();
    const rows = (await sql`SELECT id FROM team_members WHERE id = ${userId} LIMIT 1`) as Array<{ id: string }>;
    return rows.length > 0;
  } catch (err) {
    // Match the failure mode the previous Supabase query had: log and fail
    // closed (non-member), so the user lands on /access-denied or /setup
    // rather than silently bypassing auth.
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
    const sql = getClient();
    const rows = (await sql`SELECT id FROM context_versions WHERE "isActive" = true LIMIT 1`) as Array<{ id: string }>;
    return { exists: rows.length > 0, failed: false };
  } catch (err) {
    console.error('[middleware-db] hasActiveContext query failed', err);
    return { exists: false, failed: true };
  }
}
