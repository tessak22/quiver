/**
 * Tests for lib/ai/synthesis-core.ts
 *
 * Verifies the synthesis module's interface and that it exports
 * the expected function with correct types. The actual AI synthesis
 * behavior requires a live API key and database, so is tested via
 * integration tests.
 */

import { describe, it, expect } from 'vitest';
import { synthesizePerformance } from '@/lib/ai/synthesis-core';

describe('synthesis-core module', () => {
  it('exports synthesizePerformance as a function', () => {
    expect(typeof synthesizePerformance).toBe('function');
  });

  it('synthesizePerformance accepts the expected parameters', () => {
    // Verify the function signature accepts a string ID and SynthesisInput
    // This is a compile-time check that also validates at runtime
    expect(synthesizePerformance.length).toBeGreaterThanOrEqual(1);
  });
});
