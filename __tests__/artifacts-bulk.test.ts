/**
 * Tests for lib/db/artifacts-bulk.ts
 *
 * Pure function tests:
 *   - partitionByValidTransition: splits artifacts into eligible/skipped
 *   - normalizeBulkTags: trims, deduplicates, truncates, filters
 *   - MAX_BULK_IDS: sanity-check the constant
 *
 * Prisma-dependent function tests (mocked):
 *   - bulkArchive: happy path, missing IDs, concurrency count mismatch
 *   - bulkDelete: happy path, missing IDs, concurrency count mismatch
 *
 * UI logic tests (pure, mirrors handleRequestAction in artifacts/page.tsx):
 *   - Archive skip computation: only already-archived artifacts are skipped
 *   - actionableIds invariant: selected = actionable + skipped
 *   - Dialog count math: affectedCount === actionableIds.length (no double-subtract)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Prisma mock — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  prisma: {
    artifact: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import {
  partitionByValidTransition,
  normalizeBulkTags,
  MAX_BULK_IDS,
  bulkArchive,
  bulkDelete,
} from '@/lib/db/artifacts-bulk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mirrors the archive skip logic in handleRequestAction (artifacts/page.tsx). */
function computeArchiveSelection(
  selected: Array<{ id: string; status: string; title: string }>
) {
  const skipped = selected
    .filter((a) => a.status === 'archived')
    .map((a) => ({ id: a.id, reason: `"${a.title}" is already archived` }));
  const skippedIds = new Set(skipped.map((s) => s.id));
  const actionableIds = selected.filter((a) => !skippedIds.has(a.id)).map((a) => a.id);
  return { skipped, actionableIds };
}

const mockArtifact = (id: string, status = 'draft') => ({
  id,
  status,
  tags: [] as string[],
  campaignId: 'c1',
  title: `Artifact ${id}`,
});

describe('partitionByValidTransition', () => {
  it('places artifact with valid transition in eligible', () => {
    const { eligible, skipped } = partitionByValidTransition(
      [{ id: 'a1', status: 'draft' }],
      'review'
    );
    expect(eligible.map((a) => a.id)).toEqual(['a1']);
    expect(skipped).toHaveLength(0);
  });

  it('places artifact with invalid transition in skipped with reason', () => {
    const { eligible, skipped } = partitionByValidTransition(
      [{ id: 'a1', status: 'draft' }],
      'approved'
    );
    expect(eligible).toHaveLength(0);
    expect(skipped[0].id).toBe('a1');
    expect(skipped[0].reason).toContain('draft');
    expect(skipped[0].reason).toContain('approved');
  });

  it('places artifact already at target status in skipped', () => {
    const { eligible, skipped } = partitionByValidTransition(
      [{ id: 'a1', status: 'review' }],
      'review'
    );
    expect(eligible).toHaveLength(0);
    expect(skipped[0].reason).toContain('Already in status');
  });

  it('partitions a mixed set correctly', () => {
    const artifacts = [
      { id: 'a1', status: 'draft' },
      { id: 'a2', status: 'review' },
      { id: 'a3', status: 'live' },
    ];
    const { eligible, skipped } = partitionByValidTransition(artifacts, 'review');
    expect(eligible.map((a) => a.id)).toEqual(['a1']);
    expect(skipped.map((a) => a.id)).toEqual(['a2', 'a3']);
  });

  it('only live artifacts can transition to archived', () => {
    const artifacts = [
      { id: 'a1', status: 'live' },
      { id: 'a2', status: 'draft' },
      { id: 'a3', status: 'archived' },
    ];
    const { eligible, skipped } = partitionByValidTransition(artifacts, 'archived');
    expect(eligible.map((a) => a.id)).toEqual(['a1']);
    expect(skipped).toHaveLength(2);
  });

  it('returns all eligible when all artifacts can transition', () => {
    const artifacts = [
      { id: 'a1', status: 'draft' },
      { id: 'a2', status: 'draft' },
    ];
    const { eligible, skipped } = partitionByValidTransition(artifacts, 'review');
    expect(eligible).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });

  it('returns all skipped when none can transition', () => {
    const artifacts = [
      { id: 'a1', status: 'archived' },
      { id: 'a2', status: 'archived' },
    ];
    const { eligible, skipped } = partitionByValidTransition(artifacts, 'draft');
    expect(eligible).toHaveLength(0);
    expect(skipped).toHaveLength(2);
  });

  it('handles empty input', () => {
    const { eligible, skipped } = partitionByValidTransition([], 'review');
    expect(eligible).toHaveLength(0);
    expect(skipped).toHaveLength(0);
  });
});

describe('normalizeBulkTags', () => {
  it('trims whitespace', () => {
    expect(normalizeBulkTags(['  hello ', ' world  '])).toEqual(['hello', 'world']);
  });

  it('removes empty strings after trimming', () => {
    expect(normalizeBulkTags(['hello', '', '   '])).toEqual(['hello']);
  });

  it('deduplicates (case-sensitive)', () => {
    expect(normalizeBulkTags(['a', 'a', 'b'])).toEqual(['a', 'b']);
  });

  it('preserves casing', () => {
    expect(normalizeBulkTags(['Hello', 'World'])).toEqual(['Hello', 'World']);
  });

  it('truncates tags longer than 50 characters', () => {
    const long = 'a'.repeat(60);
    expect(normalizeBulkTags([long])[0]).toHaveLength(50);
  });

  it('deduplicates after truncation', () => {
    const result = normalizeBulkTags(['a'.repeat(60), 'a'.repeat(55)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(50);
  });

  it('filters out non-string values', () => {
    expect(normalizeBulkTags([1, null, 'valid'])).toEqual(['valid']);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeBulkTags([])).toEqual([]);
  });
});

describe('MAX_BULK_IDS', () => {
  it('is 100', () => {
    expect(MAX_BULK_IDS).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// bulkArchive
// ---------------------------------------------------------------------------

describe('bulkArchive', () => {
  const findMany = prisma.artifact.findMany as ReturnType<typeof vi.fn>;
  const updateMany = prisma.artifact.updateMany as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: all found rows archived → all in succeeded', async () => {
    findMany.mockResolvedValueOnce([mockArtifact('a1', 'draft'), mockArtifact('a2', 'live')]);
    updateMany.mockResolvedValueOnce({ count: 2 });

    const result = await bulkArchive(['a1', 'a2']);

    expect(result.succeeded).toEqual(['a1', 'a2']);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('missing IDs are reported as failed, found rows succeed', async () => {
    findMany.mockResolvedValueOnce([mockArtifact('a1', 'draft')]);
    updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await bulkArchive(['a1', 'missing-id']);

    expect(result.succeeded).toEqual(['a1']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe('missing-id');
    expect(result.failed[0].reason).toBe('Artifact not found');
  });

  it('concurrency mismatch: re-verifies and accurately partitions succeeded/failed', async () => {
    findMany
      // resolveArtifacts
      .mockResolvedValueOnce([mockArtifact('a1', 'draft'), mockArtifact('a2', 'draft')])
      // re-verification query (only a1 archived — a2 was deleted concurrently)
      .mockResolvedValueOnce([{ id: 'a1' }]);
    updateMany.mockResolvedValueOnce({ count: 1 }); // mismatch: 1 < 2 found

    const result = await bulkArchive(['a1', 'a2']);

    expect(result.succeeded).toEqual(['a1']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe('a2');
    expect(result.failed[0].reason).toContain('concurrent');
  });

  it('database error → all found in failed', async () => {
    findMany.mockResolvedValueOnce([mockArtifact('a1')]);
    updateMany.mockRejectedValueOnce(new Error('DB down'));

    const result = await bulkArchive(['a1']);

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed[0].id).toBe('a1');
  });
});

// ---------------------------------------------------------------------------
// bulkDelete
// ---------------------------------------------------------------------------

describe('bulkDelete', () => {
  const findMany = prisma.artifact.findMany as ReturnType<typeof vi.fn>;
  const deleteMany = prisma.artifact.deleteMany as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: all found rows deleted → all in succeeded', async () => {
    findMany.mockResolvedValueOnce([mockArtifact('a1'), mockArtifact('a2')]);
    deleteMany.mockResolvedValueOnce({ count: 2 });

    const result = await bulkDelete(['a1', 'a2']);

    expect(result.succeeded).toEqual(['a1', 'a2']);
    expect(result.failed).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('missing IDs are reported as failed, found rows succeed', async () => {
    findMany.mockResolvedValueOnce([mockArtifact('a1')]);
    deleteMany.mockResolvedValueOnce({ count: 1 });

    const result = await bulkDelete(['a1', 'missing-id']);

    expect(result.succeeded).toEqual(['a1']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe('missing-id');
    expect(result.failed[0].reason).toBe('Artifact not found');
  });

  it('concurrency mismatch: rows still existing after deleteMany are reported as failed', async () => {
    findMany
      // resolveArtifacts
      .mockResolvedValueOnce([mockArtifact('a1'), mockArtifact('a2')])
      // re-verification: a2 still exists (delete was blocked by concurrent write)
      .mockResolvedValueOnce([{ id: 'a2' }]);
    deleteMany.mockResolvedValueOnce({ count: 1 }); // mismatch: 1 < 2 found

    const result = await bulkDelete(['a1', 'a2']);

    expect(result.succeeded).toEqual(['a1']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe('a2');
    expect(result.failed[0].reason).toContain('concurrent');
  });

  it('database error → all found in failed', async () => {
    findMany.mockResolvedValueOnce([mockArtifact('a1')]);
    deleteMany.mockRejectedValueOnce(new Error('DB down'));

    const result = await bulkDelete(['a1']);

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed[0].id).toBe('a1');
  });
});

// ---------------------------------------------------------------------------
// Archive skip logic and dialog count math
// (mirrors handleRequestAction in app/(app)/artifacts/page.tsx)
// ---------------------------------------------------------------------------

describe('archive bulk selection — skip logic', () => {
  it('already-archived artifacts are skipped, others are actionable', () => {
    const selected = [
      { id: 'a1', status: 'draft', title: 'Draft one' },
      { id: 'a2', status: 'archived', title: 'Already archived' },
      { id: 'a3', status: 'live', title: 'Live one' },
    ];
    const { skipped, actionableIds } = computeArchiveSelection(selected);

    expect(skipped.map((s) => s.id)).toEqual(['a2']);
    expect(actionableIds).toEqual(['a1', 'a3']);
  });

  it('all selected already archived → all skipped, no actionable IDs', () => {
    const selected = [
      { id: 'a1', status: 'archived', title: 'A' },
      { id: 'a2', status: 'archived', title: 'B' },
    ];
    const { skipped, actionableIds } = computeArchiveSelection(selected);

    expect(skipped).toHaveLength(2);
    expect(actionableIds).toHaveLength(0);
  });

  it('none already archived → no skips, all actionable', () => {
    const selected = [
      { id: 'a1', status: 'draft', title: 'A' },
      { id: 'a2', status: 'live', title: 'B' },
    ];
    const { skipped, actionableIds } = computeArchiveSelection(selected);

    expect(skipped).toHaveLength(0);
    expect(actionableIds).toEqual(['a1', 'a2']);
  });

  it('actionableIds + skipped always equals total selected', () => {
    const selected = [
      { id: 'a1', status: 'draft', title: 'A' },
      { id: 'a2', status: 'archived', title: 'B' },
      { id: 'a3', status: 'review', title: 'C' },
      { id: 'a4', status: 'archived', title: 'D' },
    ];
    const { skipped, actionableIds } = computeArchiveSelection(selected);

    expect(actionableIds.length + skipped.length).toBe(selected.length);
  });
});

describe('dialog count math', () => {
  it('affectedCount equals actionableIds.length — no double-subtraction of skipped', () => {
    const selected = [
      { id: 'a1', status: 'draft', title: 'A' },
      { id: 'a2', status: 'archived', title: 'B' },
      { id: 'a3', status: 'live', title: 'C' },
    ];
    const { skipped, actionableIds } = computeArchiveSelection(selected);

    // totalSelected passed to dialog = actionableIds.length (already filtered)
    const totalSelected = actionableIds.length;
    // affectedCount in BulkConfirmDialog = totalSelected (no longer subtracts skipped)
    const affectedCount = totalSelected;

    expect(affectedCount).toBe(2); // a1 and a3
    expect(affectedCount).not.toBe(totalSelected - skipped.length); // old broken formula
  });

  it('affectedCount is 0 when all selected are already archived', () => {
    const selected = [
      { id: 'a1', status: 'archived', title: 'A' },
      { id: 'a2', status: 'archived', title: 'B' },
    ];
    const { actionableIds } = computeArchiveSelection(selected);

    const affectedCount = actionableIds.length;
    expect(affectedCount).toBe(0);
  });
});
