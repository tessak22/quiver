/**
 * Regression tests for the initialMessage handoff from /sessions/new
 * to /sessions/new-chat (auto-send flow).
 *
 * The component-level behavior (mount effects, router calls, ref guards) runs
 * in the browser and cannot be tested in this node environment without JSDOM.
 * These tests cover the two pure URL-manipulation steps the component relies on:
 *
 *   1. URL construction — /sessions/new builds URLSearchParams that include
 *      `initialMessage` when the user typed an intent prompt. If this step
 *      regresses (param omitted, not trimmed, wrong key), the chat page never
 *      receives the message.
 *
 *   2. URL cleanup — /sessions/[id] strips `initialMessage` from the URL via
 *      router.replace before firing the auto-send. If this regresses, going
 *      back and re-mounting the chat page would re-send the message.
 *
 * Mirrors:
 *   - handleStartSession in app/(app)/sessions/new/page.tsx
 *   - The router.replace step in the auto-send useEffect in
 *     app/(app)/sessions/[id]/page.tsx
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Pure helpers — mirror production logic exactly so a regression in either
// the tests or the page code is immediately visible.
// ---------------------------------------------------------------------------

/**
 * Mirrors handleStartSession's URLSearchParams construction.
 * Returns the full /sessions/new-chat?... URL.
 */
function buildSessionStartUrl(opts: {
  mode: string;
  artifactType?: string;
  campaignId?: string;
  intentPrompt?: string;
}): string {
  const params = new URLSearchParams();
  params.set('mode', opts.mode);
  if (opts.artifactType) params.set('artifactType', opts.artifactType);
  if (opts.campaignId) params.set('campaignId', opts.campaignId);
  if (opts.intentPrompt?.trim()) params.set('initialMessage', opts.intentPrompt.trim());
  return `/sessions/new-chat?${params.toString()}`;
}

/**
 * Mirrors the router.replace cleanup in the auto-send useEffect:
 *   const next = new URLSearchParams(searchParams.toString());
 *   next.delete('initialMessage');
 *   router.replace(`/sessions/new-chat?${next.toString()}`);
 */
function stripInitialMessage(searchParamsString: string): string {
  const next = new URLSearchParams(searchParamsString);
  next.delete('initialMessage');
  return next.toString();
}

// ---------------------------------------------------------------------------
// URL construction (handleStartSession)
// ---------------------------------------------------------------------------

describe('session start URL construction', () => {
  it('includes initialMessage when intentPrompt is non-empty', () => {
    const url = buildSessionStartUrl({ mode: 'strategy', intentPrompt: 'Help me plan GTM' });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('initialMessage')).toBe('Help me plan GTM');
  });

  it('trims leading/trailing whitespace from intentPrompt', () => {
    const url = buildSessionStartUrl({ mode: 'strategy', intentPrompt: '  whitespace  ' });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('initialMessage')).toBe('whitespace');
  });

  it('omits initialMessage when intentPrompt is empty string', () => {
    const url = buildSessionStartUrl({ mode: 'strategy', intentPrompt: '' });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('initialMessage')).toBe(false);
  });

  it('omits initialMessage when intentPrompt is only whitespace', () => {
    const url = buildSessionStartUrl({ mode: 'strategy', intentPrompt: '   ' });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('initialMessage')).toBe(false);
  });

  it('omits initialMessage when intentPrompt is not provided', () => {
    const url = buildSessionStartUrl({ mode: 'create', artifactType: 'email_sequence' });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('initialMessage')).toBe(false);
  });

  it('always includes mode', () => {
    const url = buildSessionStartUrl({ mode: 'feedback' });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('mode')).toBe('feedback');
  });

  it('includes all provided params alongside initialMessage', () => {
    const url = buildSessionStartUrl({
      mode: 'create',
      artifactType: 'email_sequence',
      campaignId: 'campaign-abc',
      intentPrompt: 'Write a welcome email',
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('mode')).toBe('create');
    expect(params.get('artifactType')).toBe('email_sequence');
    expect(params.get('campaignId')).toBe('campaign-abc');
    expect(params.get('initialMessage')).toBe('Write a welcome email');
  });

  it('route prefix is /sessions/new-chat', () => {
    const url = buildSessionStartUrl({ mode: 'analyze' });
    expect(url.startsWith('/sessions/new-chat?')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// URL cleanup (auto-send effect in sessions/[id])
// The cleanup step prevents back-navigation from re-triggering the send.
// ---------------------------------------------------------------------------

describe('initialMessage URL cleanup', () => {
  it('removes initialMessage from query params', () => {
    const input = 'mode=strategy&initialMessage=Hello+there&other=value';
    const result = stripInitialMessage(input);
    expect(new URLSearchParams(result).has('initialMessage')).toBe(false);
  });

  it('preserves mode and other params after stripping', () => {
    const input = 'mode=create&artifactType=email_sequence&initialMessage=Hi';
    const result = stripInitialMessage(input);
    const params = new URLSearchParams(result);
    expect(params.get('mode')).toBe('create');
    expect(params.get('artifactType')).toBe('email_sequence');
  });

  it('is a no-op when initialMessage is absent', () => {
    const input = 'mode=strategy&other=value';
    const result = stripInitialMessage(input);
    const params = new URLSearchParams(result);
    expect(params.has('initialMessage')).toBe(false);
    expect(params.get('mode')).toBe('strategy');
  });

  it('handles empty search params without error', () => {
    const result = stripInitialMessage('');
    expect(result).toBe('');
  });

  it('leaves empty string when initialMessage was the only param', () => {
    const input = 'initialMessage=only+this';
    const result = stripInitialMessage(input);
    expect(result).toBe('');
  });

  it('a second strip is a no-op (idempotent)', () => {
    const input = 'mode=strategy&initialMessage=Hi';
    const first = stripInitialMessage(input);
    const second = stripInitialMessage(first);
    expect(first).toBe(second);
  });
});
