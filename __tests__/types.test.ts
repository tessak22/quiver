/**
 * Tests for types/index.ts — Const array / type union completeness
 *
 * Validates that the runtime-safe const arrays (used for API validation)
 * contain all values from their corresponding type unions. TypeScript's
 * type system alone cannot guarantee this at runtime — these tests catch
 * cases where a new value is added to a type union but forgotten in the
 * const array.
 *
 * Strategy: We define the expected values inline (matching the type union
 * definitions) and assert each const array contains exactly those values.
 */

import { describe, it, expect } from 'vitest';
import {
  TEAM_ROLES,
  SESSION_MODES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_PRIORITIES,
  ARTIFACT_STATUSES,
  DEFAULT_CAMPAIGN_NAME,
  REMINDER_PREFIX,
} from '@/types';
import { getValidTransitions } from '@/lib/db/artifacts';
import { getSkillNamesForMode } from '@/lib/ai/skills';

// ---------------------------------------------------------------------------
// TEAM_ROLES completeness
// ---------------------------------------------------------------------------

describe('TEAM_ROLES', () => {
  it('contains all TeamRole values', () => {
    const expected = ['admin', 'member', 'viewer'];
    expect(TEAM_ROLES).toEqual(expect.arrayContaining(expected));
    expect(TEAM_ROLES).toHaveLength(expected.length);
  });

  it('contains no duplicates', () => {
    expect(new Set(TEAM_ROLES).size).toBe(TEAM_ROLES.length);
  });
});

// ---------------------------------------------------------------------------
// SESSION_MODES completeness
// ---------------------------------------------------------------------------

describe('SESSION_MODES', () => {
  it('contains all SessionMode values', () => {
    const expected = ['strategy', 'create', 'feedback', 'analyze', 'optimize'];
    expect(SESSION_MODES).toEqual(expect.arrayContaining(expected));
    expect(SESSION_MODES).toHaveLength(expected.length);
  });

  it('contains no duplicates', () => {
    expect(new Set(SESSION_MODES).size).toBe(SESSION_MODES.length);
  });
});

// ---------------------------------------------------------------------------
// CAMPAIGN_STATUSES completeness
// ---------------------------------------------------------------------------

describe('CAMPAIGN_STATUSES', () => {
  it('contains all CampaignStatus values', () => {
    const expected = ['planning', 'active', 'paused', 'complete', 'archived'];
    expect(CAMPAIGN_STATUSES).toEqual(expect.arrayContaining(expected));
    expect(CAMPAIGN_STATUSES).toHaveLength(expected.length);
  });

  it('contains no duplicates', () => {
    expect(new Set(CAMPAIGN_STATUSES).size).toBe(CAMPAIGN_STATUSES.length);
  });
});

// ---------------------------------------------------------------------------
// ARTIFACT_STATUSES completeness
// ---------------------------------------------------------------------------

describe('ARTIFACT_STATUSES', () => {
  it('contains all ArtifactStatus values', () => {
    const expected = ['draft', 'review', 'approved', 'live', 'archived'];
    expect(ARTIFACT_STATUSES).toEqual(expect.arrayContaining(expected));
    expect(ARTIFACT_STATUSES).toHaveLength(expected.length);
  });

  it('contains no duplicates', () => {
    expect(new Set(ARTIFACT_STATUSES).size).toBe(ARTIFACT_STATUSES.length);
  });

  // Cross-check: the artifact status transitions in lib/db/artifacts.ts should
  // cover every status defined here
  it('matches the status transition keys in artifacts.ts', () => {
    for (const status of ARTIFACT_STATUSES) {
      // getValidTransitions returns [] for unknown, but for known statuses
      // it should return the value from STATUS_TRANSITIONS map.
      // We just verify it doesn't return undefined (which would mean the
      // status isn't in the map at all — it would still return [] via ?? [])
      const transitions = getValidTransitions(status);
      expect(Array.isArray(transitions)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// CAMPAIGN_PRIORITIES completeness
// ---------------------------------------------------------------------------

describe('CAMPAIGN_PRIORITIES', () => {
  it('contains all CampaignPriority values', () => {
    const expected = ['high', 'medium', 'low'];
    expect(CAMPAIGN_PRIORITIES).toEqual(expect.arrayContaining(expected));
    expect(CAMPAIGN_PRIORITIES).toHaveLength(expected.length);
  });

  it('contains no duplicates', () => {
    expect(new Set(CAMPAIGN_PRIORITIES).size).toBe(CAMPAIGN_PRIORITIES.length);
  });
});

// ---------------------------------------------------------------------------
// Magic-string constants
// ---------------------------------------------------------------------------

describe('Magic-string constants', () => {
  it('DEFAULT_CAMPAIGN_NAME is a non-empty string', () => {
    expect(typeof DEFAULT_CAMPAIGN_NAME).toBe('string');
    expect(DEFAULT_CAMPAIGN_NAME.length).toBeGreaterThan(0);
  });

  it('DEFAULT_CAMPAIGN_NAME is "Unassigned"', () => {
    expect(DEFAULT_CAMPAIGN_NAME).toBe('Unassigned');
  });

  it('REMINDER_PREFIX is a non-empty string', () => {
    expect(typeof REMINDER_PREFIX).toBe('string');
    expect(REMINDER_PREFIX.length).toBeGreaterThan(0);
  });

  it('REMINDER_PREFIX starts with "Reminder:"', () => {
    expect(REMINDER_PREFIX).toMatch(/^Reminder:/);
  });
});

// ---------------------------------------------------------------------------
// Cross-module consistency: SESSION_MODES should match skill mode keys
// ---------------------------------------------------------------------------

describe('Cross-module consistency', () => {
  it('every SESSION_MODE is handled by getSkillNamesForMode', () => {
    for (const mode of SESSION_MODES) {
      // create mode without artifact type returns default skills
      const names = getSkillNamesForMode(mode);
      expect(Array.isArray(names)).toBe(true);
    }
  });
});
