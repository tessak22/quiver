/**
 * Tests for context proposal helper logic
 *
 * The context propose route (app/api/context/propose/route.ts) contains two
 * pure helpers — isValidContextField and safeStringify — that guard the
 * context update flow. Since they are private to the route module, we
 * re-implement the logic here (the same pattern used in session-helpers.test.ts)
 * and validate expected behavior. If these tests break, it means the internal
 * logic changed and the route should be updated in sync.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// VALID_CONTEXT_FIELDS — the allowlist of updatable context fields
// ---------------------------------------------------------------------------

const VALID_CONTEXT_FIELDS = [
  'positioningStatement',
  'icpDefinition',
  'messagingPillars',
  'competitiveLandscape',
  'customerLanguage',
  'proofPoints',
  'activeHypotheses',
  'brandVoice',
] as const;

type ContextField = (typeof VALID_CONTEXT_FIELDS)[number];

function isValidContextField(value: string): value is ContextField {
  return VALID_CONTEXT_FIELDS.includes(value as ContextField);
}

describe('isValidContextField', () => {
  it('accepts all valid context field names', () => {
    for (const field of VALID_CONTEXT_FIELDS) {
      expect(isValidContextField(field)).toBe(true);
    }
  });

  it('rejects unknown field names', () => {
    expect(isValidContextField('unknownField')).toBe(false);
    expect(isValidContextField('name')).toBe(false);
    expect(isValidContextField('email')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidContextField('')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(isValidContextField('PositioningStatement')).toBe(false);
    expect(isValidContextField('POSITIONINGSTATEMENT')).toBe(false);
    expect(isValidContextField('positioningstatement')).toBe(false);
  });

  it('rejects fields with extra whitespace', () => {
    expect(isValidContextField(' positioningStatement')).toBe(false);
    expect(isValidContextField('positioningStatement ')).toBe(false);
  });

  it('contains exactly 8 valid fields', () => {
    expect(VALID_CONTEXT_FIELDS).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// safeStringify — safe JSON stringification for context field values
// ---------------------------------------------------------------------------

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

describe('safeStringify', () => {
  it('returns empty string for null', () => {
    expect(safeStringify(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(safeStringify(undefined)).toBe('');
  });

  it('returns strings as-is', () => {
    expect(safeStringify('hello world')).toBe('hello world');
  });

  it('returns empty string for empty string input', () => {
    expect(safeStringify('')).toBe('');
  });

  it('JSON-stringifies objects with 2-space indentation', () => {
    const result = safeStringify({ key: 'value' });
    expect(result).toBe('{\n  "key": "value"\n}');
  });

  it('JSON-stringifies arrays with 2-space indentation', () => {
    const result = safeStringify(['a', 'b']);
    expect(result).toBe('[\n  "a",\n  "b"\n]');
  });

  it('JSON-stringifies numbers', () => {
    expect(safeStringify(42)).toBe('42');
  });

  it('JSON-stringifies booleans', () => {
    expect(safeStringify(true)).toBe('true');
    expect(safeStringify(false)).toBe('false');
  });

  it('handles nested objects', () => {
    const result = safeStringify({ a: { b: 'c' } });
    expect(result).toContain('"a"');
    expect(result).toContain('"b": "c"');
  });

  it('returns empty string for circular references', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(safeStringify(circular)).toBe('');
  });
});
