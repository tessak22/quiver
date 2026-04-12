/**
 * Tests for lib/db/artifacts-bulk.ts — Pure function tests
 *
 * Tests the pure (non-Prisma) helpers:
 *   - partitionByValidTransition: splits artifacts into eligible/skipped
 *   - normalizeBulkTags: trims, deduplicates, truncates, filters
 *   - MAX_BULK_IDS: sanity-check the constant
 *
 * Prisma-dependent functions (bulkStatusChange, etc.) require a real database
 * and are NOT tested here.
 */

import { describe, it, expect } from 'vitest';
import {
  partitionByValidTransition,
  normalizeBulkTags,
  MAX_BULK_IDS,
} from '@/lib/db/artifacts-bulk';

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
