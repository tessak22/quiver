/**
 * lib/artifact-transitions.ts
 *
 * What it does: Defines the artifact status state machine and the pure helper
 *   for querying valid transitions. Intentionally free of Prisma imports so
 *   it can be used in both server and 'use client' contexts.
 *
 * What it reads from: nothing (pure logic)
 * What it produces: getValidTransitions(currentStatus) → string[]
 *
 * Edge cases:
 *   - Unknown status returns [] — no transitions permitted (safe default)
 */

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['review'],
  review: ['approved', 'draft'],
  approved: ['live', 'review'],
  live: ['archived'],
  archived: [],
};

export function getValidTransitions(currentStatus: string): string[] {
  return STATUS_TRANSITIONS[currentStatus] ?? [];
}
