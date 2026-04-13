/**
 * Tests for POST /api/sessions/intent (app/api/sessions/intent/route.ts).
 *
 * Covers:
 *   - Validation: empty prompt returns 400 with descriptive body
 *   - Validation: prompt over 500 chars returns 400 with descriptive body
 *   - Success: valid prompt returns { mode, confidence, reasoning } shape
 *   - Error handling: AI error returns 500 with body (never empty 500)
 *
 * lib/ai/intent.ts is mocked — no live AI calls, no auth/DB in test env.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (hoisted before any imports) ──────────────────────────────────────

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn().mockResolvedValue({ id: 'user-1', role: 'viewer' }),
}));

vi.mock('@/lib/ai/intent', () => ({
  classifyIntent: vi.fn(),
}));

import { POST } from '@/app/api/sessions/intent/route';
import { classifyIntent } from '@/lib/ai/intent';
import type { IntentResult } from '@/lib/ai/intent';

const mockClassifyIntent = vi.mocked(classifyIntent);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/sessions/intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/sessions/intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when prompt is empty string', async () => {
    const req = makeRequest({ prompt: '' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('returns 400 when prompt is missing', async () => {
    const req = makeRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when prompt exceeds 500 characters', async () => {
    const longPrompt = 'a'.repeat(501);
    const req = makeRequest({ prompt: longPrompt });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('returns 400 when prompt is exactly 500 characters (boundary)', async () => {
    // 500 chars is the max allowed — should succeed
    const exactPrompt = 'a'.repeat(500);
    mockClassifyIntent.mockResolvedValue({
      mode: 'strategy',
      confidence: 'high',
      reasoning: 'Looks strategic.',
    });
    const req = makeRequest({ prompt: exactPrompt });
    const res = await POST(req);

    expect(res.status).toBe(200);
  });

  it('returns correct shape for a valid prompt', async () => {
    const mockResult: IntentResult = {
      mode: 'create',
      artifactType: 'email_sequence',
      confidence: 'high',
      reasoning: 'The user wants to write an email sequence.',
    };
    mockClassifyIntent.mockResolvedValue(mockResult);

    const req = makeRequest({ prompt: 'Write me a welcome email sequence' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('mode', 'create');
    expect(body).toHaveProperty('artifactType', 'email_sequence');
    expect(body).toHaveProperty('confidence', 'high');
    expect(body).toHaveProperty('reasoning');
    expect(typeof body.reasoning).toBe('string');
  });

  it('returns correct shape for non-create mode (no artifactType)', async () => {
    const mockResult: IntentResult = {
      mode: 'strategy',
      confidence: 'high',
      reasoning: 'User wants a strategy session.',
    };
    mockClassifyIntent.mockResolvedValue(mockResult);

    const req = makeRequest({ prompt: 'Help me build a go-to-market strategy' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('mode', 'strategy');
    expect(body).not.toHaveProperty('artifactType');
    expect(body).toHaveProperty('confidence', 'high');
    expect(body).toHaveProperty('reasoning');
  });

  it('returns 500 with body when classifyIntent throws', async () => {
    mockClassifyIntent.mockRejectedValue(new Error('Unexpected AI failure'));

    const req = makeRequest({ prompt: 'What mode should I use?' });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });
});
