/**
 * Tests for lib/db/content.ts — Pure helper functions
 *
 * The CRUD functions require Prisma and are not tested here.
 * These tests exercise the pure logic that is testable in isolation:
 *   - generateSlug: slug generation from titles with uniqueness suffix
 *   - getContentPerformanceSignal: performance signal classification
 *
 * generateSlug uses Prisma internally, so we mock prisma.contentPiece.findUnique
 * to control slug collision behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSlug, getContentPerformanceSignal } from '@/lib/db/content';

// Mock the Prisma client used by content.ts
vi.mock('@/lib/db', () => ({
  prisma: {
    contentPiece: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

// ---------------------------------------------------------------------------
// generateSlug — URL-safe slug generation with uniqueness suffixes
// ---------------------------------------------------------------------------

describe('generateSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('converts a simple title to a lowercase hyphenated slug', async () => {
    vi.mocked(prisma.contentPiece.findUnique).mockResolvedValue(null);
    const slug = await generateSlug('Hello World');
    expect(slug).toBe('hello-world');
  });

  it('strips special characters', async () => {
    vi.mocked(prisma.contentPiece.findUnique).mockResolvedValue(null);
    const slug = await generateSlug("What's New in v2.0?");
    expect(slug).toBe('what-s-new-in-v2-0');
  });

  it('collapses consecutive non-alphanumeric characters into a single hyphen', async () => {
    vi.mocked(prisma.contentPiece.findUnique).mockResolvedValue(null);
    const slug = await generateSlug('Hello --- World!!!');
    expect(slug).toBe('hello-world');
  });

  it('strips leading and trailing hyphens', async () => {
    vi.mocked(prisma.contentPiece.findUnique).mockResolvedValue(null);
    const slug = await generateSlug('---Hello World---');
    expect(slug).toBe('hello-world');
  });

  it('handles titles with only special characters', async () => {
    vi.mocked(prisma.contentPiece.findUnique).mockResolvedValue(null);
    const slug = await generateSlug('!!!@@@###');
    expect(slug).toBe('');
  });

  it('handles titles with unicode characters', async () => {
    vi.mocked(prisma.contentPiece.findUnique).mockResolvedValue(null);
    const slug = await generateSlug('Cafe au Lait');
    expect(slug).toBe('cafe-au-lait');
  });

  it('appends -2 when the base slug already exists', async () => {
    vi.mocked(prisma.contentPiece.findUnique)
      .mockResolvedValueOnce({ id: 'existing-1' } as never) // base slug taken
      .mockResolvedValueOnce(null); // base-2 available
    const slug = await generateSlug('Hello World');
    expect(slug).toBe('hello-world-2');
  });

  it('increments suffix until an available slug is found', async () => {
    vi.mocked(prisma.contentPiece.findUnique)
      .mockResolvedValueOnce({ id: 'existing-1' } as never) // base taken
      .mockResolvedValueOnce({ id: 'existing-2' } as never) // base-2 taken
      .mockResolvedValueOnce({ id: 'existing-3' } as never) // base-3 taken
      .mockResolvedValueOnce(null); // base-4 available
    const slug = await generateSlug('Hello World');
    expect(slug).toBe('hello-world-4');
  });

  it('queries prisma for each collision check', async () => {
    vi.mocked(prisma.contentPiece.findUnique)
      .mockResolvedValueOnce({ id: 'existing-1' } as never)
      .mockResolvedValueOnce(null);
    await generateSlug('Hello World');
    expect(prisma.contentPiece.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.contentPiece.findUnique).toHaveBeenCalledWith({
      where: { slug: 'hello-world' },
      select: { id: true },
    });
    expect(prisma.contentPiece.findUnique).toHaveBeenCalledWith({
      where: { slug: 'hello-world-2' },
      select: { id: true },
    });
  });

  it('handles numbers in titles', async () => {
    vi.mocked(prisma.contentPiece.findUnique).mockResolvedValue(null);
    const slug = await generateSlug('Top 10 Tips for 2024');
    expect(slug).toBe('top-10-tips-for-2024');
  });

  it('handles single-word titles', async () => {
    vi.mocked(prisma.contentPiece.findUnique).mockResolvedValue(null);
    const slug = await generateSlug('Guide');
    expect(slug).toBe('guide');
  });
});

// ---------------------------------------------------------------------------
// getContentPerformanceSignal — classifies content performance
// ---------------------------------------------------------------------------

describe('getContentPerformanceSignal', () => {
  it('returns no_data for empty snapshots array', () => {
    expect(getContentPerformanceSignal([])).toBe('no_data');
  });

  it('returns no_data for null-like input', () => {
    // The function checks !snapshots first
    expect(getContentPerformanceSignal(null as never)).toBe('no_data');
    expect(getContentPerformanceSignal(undefined as never)).toBe('no_data');
  });

  it('returns logging for fewer than 3 snapshots', () => {
    expect(
      getContentPerformanceSignal([{ pageviews: 100 }])
    ).toBe('logging');
    expect(
      getContentPerformanceSignal([{ pageviews: 100 }, { pageviews: 200 }])
    ).toBe('logging');
  });

  it('returns logging when all pageviews are null', () => {
    expect(
      getContentPerformanceSignal([
        { pageviews: null },
        { pageviews: null },
        { pageviews: null },
      ])
    ).toBe('logging');
  });

  it('returns strong when latest pageviews >= average', () => {
    // Latest is first element (ordered desc by snapshotDate)
    // Data: [300, 200, 100] => avg = 200, latest = 300 >= 200 => strong
    expect(
      getContentPerformanceSignal([
        { pageviews: 300 },
        { pageviews: 200 },
        { pageviews: 100 },
      ])
    ).toBe('strong');
  });

  it('returns strong when latest equals average exactly', () => {
    // Data: [200, 200, 200] => avg = 200, latest = 200 >= 200 => strong
    expect(
      getContentPerformanceSignal([
        { pageviews: 200 },
        { pageviews: 200 },
        { pageviews: 200 },
      ])
    ).toBe('strong');
  });

  it('returns weak when latest < 50% of average', () => {
    // Data: [10, 200, 300] => avg = 170, latest = 10 < 85 (170*0.5) => weak
    expect(
      getContentPerformanceSignal([
        { pageviews: 10 },
        { pageviews: 200 },
        { pageviews: 300 },
      ])
    ).toBe('weak');
  });

  it('returns logging when latest is between 50% and 100% of average', () => {
    // Data: [120, 200, 280] => avg = 200, latest = 120 < 200 but >= 100 => logging
    expect(
      getContentPerformanceSignal([
        { pageviews: 120 },
        { pageviews: 200 },
        { pageviews: 280 },
      ])
    ).toBe('logging');
  });

  it('returns logging when average is zero (all zero pageviews)', () => {
    expect(
      getContentPerformanceSignal([
        { pageviews: 0 },
        { pageviews: 0 },
        { pageviews: 0 },
      ])
    ).toBe('logging');
  });

  it('filters out null pageviews and uses only non-null values', () => {
    // Data: [150, null, 100, null, 50] => non-null: [150, 100, 50]
    // avg = 100, latest = 150 >= 100 => strong
    expect(
      getContentPerformanceSignal([
        { pageviews: 150 },
        { pageviews: null },
        { pageviews: 100 },
        { pageviews: null },
        { pageviews: 50 },
      ])
    ).toBe('strong');
  });

  it('handles mixed null and non-null with weak signal', () => {
    // Data: [5, null, 200, null, 300] => non-null: [5, 200, 300]
    // avg ≈ 168.3, latest = 5 < 84.17 => weak
    expect(
      getContentPerformanceSignal([
        { pageviews: 5 },
        { pageviews: null },
        { pageviews: 200 },
        { pageviews: null },
        { pageviews: 300 },
      ])
    ).toBe('weak');
  });

  it('returns logging when 3+ snapshots exist but all have null pageviews', () => {
    expect(
      getContentPerformanceSignal([
        { pageviews: null },
        { pageviews: null },
        { pageviews: null },
        { pageviews: null },
      ])
    ).toBe('logging');
  });
});
