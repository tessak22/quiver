/**
 * Tests for lib/db/artifacts.ts — Pure function tests
 *
 * Tests the pure (non-Prisma) business logic in artifacts.ts:
 *   - getValidTransitions: status transition state machine
 *   - getPerformanceSignal: performance classification logic
 *
 * The Prisma-dependent functions (createArtifact, getArtifact, etc.) are
 * thin wrappers and are NOT tested here — they would require a database.
 */

import { describe, it, expect } from 'vitest';
import { getValidTransitions, getPerformanceSignal } from '@/lib/db/artifacts';

// ---------------------------------------------------------------------------
// getValidTransitions — artifact status state machine
// ---------------------------------------------------------------------------

describe('getValidTransitions', () => {
  it('draft can only transition to review', () => {
    expect(getValidTransitions('draft')).toEqual(['review']);
  });

  it('review can transition to approved or back to draft', () => {
    const valid = getValidTransitions('review');
    expect(valid).toContain('approved');
    expect(valid).toContain('draft');
    expect(valid).toHaveLength(2);
  });

  it('approved can transition to live or back to review', () => {
    const valid = getValidTransitions('approved');
    expect(valid).toContain('live');
    expect(valid).toContain('review');
    expect(valid).toHaveLength(2);
  });

  it('live can only transition to archived', () => {
    expect(getValidTransitions('live')).toEqual(['archived']);
  });

  it('archived has no valid transitions (terminal state)', () => {
    expect(getValidTransitions('archived')).toEqual([]);
  });

  it('returns empty array for unknown status', () => {
    expect(getValidTransitions('invalid_status')).toEqual([]);
  });

  // Verify the full workflow path is reachable
  it('supports the complete happy path: draft -> review -> approved -> live -> archived', () => {
    expect(getValidTransitions('draft')).toContain('review');
    expect(getValidTransitions('review')).toContain('approved');
    expect(getValidTransitions('approved')).toContain('live');
    expect(getValidTransitions('live')).toContain('archived');
  });

  // Verify backward transitions exist
  it('supports backward transitions for review cycles', () => {
    expect(getValidTransitions('review')).toContain('draft');
    expect(getValidTransitions('approved')).toContain('review');
  });

  // No skip transitions
  it('does not allow skipping statuses (draft cannot jump to approved)', () => {
    expect(getValidTransitions('draft')).not.toContain('approved');
    expect(getValidTransitions('draft')).not.toContain('live');
    expect(getValidTransitions('draft')).not.toContain('archived');
  });

  it('does not allow skipping from review to live', () => {
    expect(getValidTransitions('review')).not.toContain('live');
    expect(getValidTransitions('review')).not.toContain('archived');
  });

  it('does not allow going backward from live', () => {
    expect(getValidTransitions('live')).not.toContain('draft');
    expect(getValidTransitions('live')).not.toContain('review');
    expect(getValidTransitions('live')).not.toContain('approved');
  });
});

// ---------------------------------------------------------------------------
// getPerformanceSignal — classifies artifact performance
// ---------------------------------------------------------------------------

describe('getPerformanceSignal', () => {
  it('returns "no_data" when performanceLogs is undefined', () => {
    expect(getPerformanceSignal({})).toBe('no_data');
  });

  it('returns "no_data" when performanceLogs is empty array', () => {
    expect(getPerformanceSignal({ performanceLogs: [] })).toBe('no_data');
  });

  it('returns "strong" when only whatWorked is set', () => {
    expect(
      getPerformanceSignal({
        performanceLogs: [{ whatWorked: 'Great CTR', whatDidnt: null }],
      })
    ).toBe('strong');
  });

  it('returns "weak" when only whatDidnt is set', () => {
    expect(
      getPerformanceSignal({
        performanceLogs: [{ whatWorked: null, whatDidnt: 'Low engagement' }],
      })
    ).toBe('weak');
  });

  it('returns "logging" when both whatWorked and whatDidnt are set', () => {
    expect(
      getPerformanceSignal({
        performanceLogs: [
          { whatWorked: 'Good open rate', whatDidnt: 'Low click-through' },
        ],
      })
    ).toBe('logging');
  });

  it('returns "logging" when both fields are empty strings', () => {
    // NOTE: Empty strings are falsy in JS, so both `whatWorked` and `whatDidnt`
    // evaluate to false in the conditional checks. The function falls through
    // both "strong" and "weak" cases to return "logging". This is current
    // behavior — a log entry exists but has no meaningful data in either field.
    expect(
      getPerformanceSignal({
        performanceLogs: [{ whatWorked: '', whatDidnt: '' }],
      })
    ).toBe('logging');
  });

  it('uses only the first (most recent) log entry', () => {
    expect(
      getPerformanceSignal({
        performanceLogs: [
          { whatWorked: 'Great results', whatDidnt: null },
          { whatWorked: null, whatDidnt: 'Terrible results' },
        ],
      })
    ).toBe('strong');
  });

  it('treats non-null but empty whatWorked as falsy', () => {
    expect(
      getPerformanceSignal({
        performanceLogs: [{ whatWorked: '', whatDidnt: 'Bad results' }],
      })
    ).toBe('weak');
  });

  it('treats non-null but empty whatDidnt as falsy', () => {
    expect(
      getPerformanceSignal({
        performanceLogs: [{ whatWorked: 'Good results', whatDidnt: '' }],
      })
    ).toBe('strong');
  });
});
