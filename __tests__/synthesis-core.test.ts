/**
 * Tests for lib/ai/synthesis-core.ts
 *
 * Verifies the synthesis module's interface and error paths.
 * The actual AI synthesis behavior requires a live API key and database,
 * so is tested via integration tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { synthesizePerformance } from '@/lib/ai/synthesis-core';

// Mock dependencies to avoid DB/API calls
vi.mock('@/lib/ai/client', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('@/lib/db/context', () => ({
  getActiveContext: vi.fn(),
}));

vi.mock('@/lib/db/performance', () => ({
  updatePerformanceLog: vi.fn(),
}));

import { sendMessage } from '@/lib/ai/client';
import { getActiveContext } from '@/lib/db/context';
import { updatePerformanceLog } from '@/lib/db/performance';

describe('synthesis-core module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveContext).mockResolvedValue(null);
    vi.mocked(updatePerformanceLog).mockResolvedValue(undefined as never);
  });

  it('exports synthesizePerformance as a function', () => {
    expect(typeof synthesizePerformance).toBe('function');
  });

  it('returns empty proposals when AI returns no JSON array', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ content: 'No changes needed.', error: null });
    const result = await synthesizePerformance('log-1', { whatWorked: 'email open rates' });
    expect(result).toEqual({ proposals: [] });
  });

  it('returns empty proposals when AI call errors', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ content: '', error: 'API error' });
    const result = await synthesizePerformance('log-1', {});
    expect(result).toEqual({ proposals: [] });
  });

  it('returns empty proposals when AI returns malformed JSON', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ content: '[not valid json', error: null });
    const result = await synthesizePerformance('log-1', {});
    expect(result).toEqual({ proposals: [] });
  });

  it('returns proposals and updates the log when AI returns valid JSON', async () => {
    const mockProposals = [
      { field: 'positioningStatement', current: 'old', proposed: 'new', rationale: 'test' },
    ];
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(mockProposals),
      error: null,
    });

    const result = await synthesizePerformance('log-1', { whatWorked: 'subject lines' });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].field).toBe('positioningStatement');
    expect(updatePerformanceLog).toHaveBeenCalledWith('log-1', {
      proposedContextUpdates: mockProposals,
      contextUpdateStatus: 'pending',
    });
  });

  it('returns empty proposals when AI returns an empty array', async () => {
    vi.mocked(sendMessage).mockResolvedValue({ content: '[]', error: null });
    const result = await synthesizePerformance('log-1', {});
    expect(result).toEqual({ proposals: [] });
    expect(updatePerformanceLog).not.toHaveBeenCalled();
  });
});
