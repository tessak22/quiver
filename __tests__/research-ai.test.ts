/**
 * Tests for lib/ai/research.ts — AI research processing pipeline
 *
 * What this tests: The processResearchEntry function's end-to-end behavior
 *   with mocked dependencies (no live AI calls, no DB writes). Focuses on:
 *   - Safe default returns when AI call fails
 *   - Safe default returns when AI returns invalid JSON
 *   - Correct parsing of valid AI responses
 *   - Handling of JSON wrapped in markdown code fences
 *   - Partial response validation (missing optional fields)
 *   - Context proposal forwarding to performance logs
 *
 * The internal helper functions (parseAIResponse, validateParsed, buildSystemPrompt,
 * buildUserMessage) are private. We test them indirectly through processResearchEntry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processResearchEntry } from '@/lib/ai/research';
import type { AIError } from '@/lib/ai/client';

// Mock all external dependencies
vi.mock('@/lib/ai/client', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('@/lib/db/context', () => ({
  getActiveContext: vi.fn(),
}));

vi.mock('@/lib/db/research', () => ({
  updateResearchEntry: vi.fn(),
  createResearchQuotes: vi.fn(),
}));

vi.mock('@/lib/db/performance', () => ({
  createPerformanceLog: vi.fn(),
}));

vi.mock('@/lib/db/campaigns', () => ({
  getDefaultCampaign: vi.fn(),
}));

import { sendMessage } from '@/lib/ai/client';
import { getActiveContext } from '@/lib/db/context';
import { updateResearchEntry, createResearchQuotes } from '@/lib/db/research';
import { createPerformanceLog } from '@/lib/db/performance';
import { getDefaultCampaign } from '@/lib/db/campaigns';

const SAMPLE_ENTRY = {
  id: 'entry-1',
  title: 'Customer Interview — Acme Corp',
  sourceType: 'interview',
  contactName: 'Jane Doe',
  contactCompany: 'Acme Corp',
  contactSegment: 'enterprise',
  contactStage: 'customer',
  rawNotes: 'The user mentioned pricing was too high but loved the onboarding.',
  campaignId: 'campaign-1',
};

const VALID_AI_RESPONSE = {
  summary: 'Customer loves onboarding but finds pricing too high.',
  themes: ['pricing', 'onboarding'],
  sentiment: 'mixed',
  quotes: [
    {
      quote: 'Pricing was too high',
      context: 'Discussing renewal',
      theme: 'pricing',
    },
  ],
  hypothesisSignals: [],
  contextProposals: [],
};

describe('processResearchEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveContext).mockResolvedValue(null);
    vi.mocked(updateResearchEntry).mockResolvedValue(undefined as never);
    vi.mocked(createResearchQuotes).mockResolvedValue({ count: 0 } as never);
    vi.mocked(createPerformanceLog).mockResolvedValue(undefined as never);
    vi.mocked(getDefaultCampaign).mockResolvedValue({ id: 'default-campaign' } as never);
  });

  // -----------------------------------------------------------------------
  // Safe defaults on failure
  // -----------------------------------------------------------------------

  it('returns safe defaults when AI call returns an error', async () => {
    const apiError: AIError = { code: 'api_error', message: 'Service unavailable' };
    vi.mocked(sendMessage).mockResolvedValue({ error: apiError });

    const result = await processResearchEntry(SAMPLE_ENTRY);

    expect(result.summary).toBe(
      'AI processing could not extract a summary from this entry.'
    );
    expect(result.themes).toEqual([]);
    expect(result.sentiment).toBe('neutral');
    expect(result.quotes).toEqual([]);
    expect(result.hypothesisSignals).toEqual([]);
    expect(result.contextProposals).toEqual([]);
  });

  it('writes safe defaults to DB when AI call fails', async () => {
    const apiError: AIError = { code: 'api_error', message: 'fail' };
    vi.mocked(sendMessage).mockResolvedValue({ error: apiError });

    await processResearchEntry(SAMPLE_ENTRY);

    expect(updateResearchEntry).toHaveBeenCalledWith('entry-1', {
      summary: 'AI processing could not extract a summary from this entry.',
      themes: [],
      sentiment: 'neutral',
      hypothesisSignals: [],
    });
  });

  it('returns safe defaults when AI returns completely invalid JSON', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      content: 'This is not JSON at all, just plain text with no braces.',
    });

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.summary).toBe(
      'AI processing could not extract a summary from this entry.'
    );
    expect(result.themes).toEqual([]);
  });

  it('returns safe defaults when AI returns malformed JSON', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      content: '{ "summary": "incomplete',
    });

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.summary).toBe(
      'AI processing could not extract a summary from this entry.'
    );
  });

  it('returns safe defaults when AI returns JSON missing required summary field', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify({ themes: ['pricing'] }),
    });

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.summary).toBe(
      'AI processing could not extract a summary from this entry.'
    );
  });

  it('returns safe defaults when sendMessage throws an exception', async () => {
    vi.mocked(sendMessage).mockRejectedValue(new Error('Network error'));

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.summary).toBe(
      'AI processing could not extract a summary from this entry.'
    );
    expect(result.themes).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Successful parsing
  // -----------------------------------------------------------------------

  it('correctly parses a valid AI JSON response', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(VALID_AI_RESPONSE),
    });

    const result = await processResearchEntry(SAMPLE_ENTRY);

    expect(result.summary).toBe('Customer loves onboarding but finds pricing too high.');
    expect(result.themes).toEqual(['pricing', 'onboarding']);
    expect(result.sentiment).toBe('mixed');
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].quote).toBe('Pricing was too high');
  });

  it('parses JSON embedded in markdown code fences', async () => {
    const wrappedContent = '```json\n' + JSON.stringify(VALID_AI_RESPONSE) + '\n```';
    vi.mocked(sendMessage).mockResolvedValue({ content: wrappedContent });

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.summary).toBe('Customer loves onboarding but finds pricing too high.');
    expect(result.themes).toEqual(['pricing', 'onboarding']);
  });

  it('parses JSON with surrounding explanation text', async () => {
    const wrappedContent =
      'Here is my analysis:\n' +
      JSON.stringify(VALID_AI_RESPONSE) +
      '\nHope this helps!';
    vi.mocked(sendMessage).mockResolvedValue({ content: wrappedContent });

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.summary).toBe('Customer loves onboarding but finds pricing too high.');
  });

  // -----------------------------------------------------------------------
  // Partial/missing optional fields
  // -----------------------------------------------------------------------

  it('defaults sentiment to neutral when missing', async () => {
    const partial = { ...VALID_AI_RESPONSE, sentiment: undefined };
    // Remove sentiment key entirely
    const { sentiment: _s, ...withoutSentiment } = partial;
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(withoutSentiment),
    });

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.sentiment).toBe('neutral');
  });

  it('defaults themes to empty array when not an array', async () => {
    const partial = { ...VALID_AI_RESPONSE, themes: 'pricing' };
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(partial),
    });

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.themes).toEqual([]);
  });

  it('filters non-string values from themes array', async () => {
    const partial = { ...VALID_AI_RESPONSE, themes: ['pricing', 42, null, 'onboarding'] };
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(partial),
    });

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.themes).toEqual(['pricing', 'onboarding']);
  });

  it('defaults quote context and theme when missing', async () => {
    const partial = {
      ...VALID_AI_RESPONSE,
      quotes: [{ quote: 'Just the quote' }],
    };
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(partial),
    });

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].context).toBe('');
    expect(result.quotes[0].theme).toBe('other');
  });

  it('filters out quotes without a quote string', async () => {
    const partial = {
      ...VALID_AI_RESPONSE,
      quotes: [
        { quote: 'Valid quote', context: 'ctx', theme: 'pricing' },
        { context: 'no quote field', theme: 'pricing' },
        { quote: 123 }, // not a string
      ],
    };
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(partial),
    });

    const result = await processResearchEntry(SAMPLE_ENTRY);
    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0].quote).toBe('Valid quote');
  });

  // -----------------------------------------------------------------------
  // DB writes on success
  // -----------------------------------------------------------------------

  it('updates research entry with parsed results', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(VALID_AI_RESPONSE),
    });

    await processResearchEntry(SAMPLE_ENTRY);

    expect(updateResearchEntry).toHaveBeenCalledWith('entry-1', {
      summary: 'Customer loves onboarding but finds pricing too high.',
      themes: ['pricing', 'onboarding'],
      sentiment: 'mixed',
      hypothesisSignals: [],
    });
  });

  it('creates research quotes from parsed results', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(VALID_AI_RESPONSE),
    });

    await processResearchEntry(SAMPLE_ENTRY);

    expect(createResearchQuotes).toHaveBeenCalledWith([
      {
        researchEntryId: 'entry-1',
        quote: 'Pricing was too high',
        context: 'Discussing renewal',
        theme: 'pricing',
        segment: 'enterprise',
      },
    ]);
  });

  // -----------------------------------------------------------------------
  // Context proposals
  // -----------------------------------------------------------------------

  it('creates a performance log when context proposals exist', async () => {
    const responseWithProposals = {
      ...VALID_AI_RESPONSE,
      contextProposals: [
        {
          field: 'customerLanguage',
          current: 'old language',
          proposed: 'new language',
          rationale: 'Based on customer feedback',
        },
      ],
    };
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(responseWithProposals),
    });

    await processResearchEntry(SAMPLE_ENTRY);

    expect(createPerformanceLog).toHaveBeenCalledWith({
      logType: 'context_proposal',
      proposedContextUpdates: responseWithProposals.contextProposals,
      campaignId: 'campaign-1',
      qualitativeNotes: 'Research-driven proposal from: entry-1',
      recordedBy: 'research_ai',
    });
  });

  it('does not create a performance log when there are no context proposals', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(VALID_AI_RESPONSE),
    });

    await processResearchEntry(SAMPLE_ENTRY);

    expect(createPerformanceLog).not.toHaveBeenCalled();
  });

  it('falls back to default campaign when entry has no campaignId', async () => {
    const responseWithProposals = {
      ...VALID_AI_RESPONSE,
      contextProposals: [
        { field: 'icpDefinition', current: '', proposed: 'new ICP', rationale: 'reason' },
      ],
    };
    vi.mocked(sendMessage).mockResolvedValue({
      content: JSON.stringify(responseWithProposals),
    });

    const entryWithoutCampaign = { ...SAMPLE_ENTRY, campaignId: null };
    await processResearchEntry(entryWithoutCampaign);

    expect(getDefaultCampaign).toHaveBeenCalled();
    expect(createPerformanceLog).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: 'default-campaign' })
    );
  });
});
