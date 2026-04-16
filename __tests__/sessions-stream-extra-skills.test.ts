/**
 * Tests for the boundary validation of extraSkills on POST /api/sessions/stream.
 *
 * Auth, rate limiter, session/prompt assembly, and the AI client are all mocked
 * so the test focuses on the validation gate that runs before any of them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn().mockResolvedValue({ id: 'user-1', email: 'u@e.c', role: 'member' }),
}));

vi.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: { check: vi.fn().mockReturnValue(true) },
}));

vi.mock('@/lib/ai/client', () => ({
  createStream: vi.fn(),
}));

vi.mock('@/lib/ai/session', () => ({
  assembleSystemPrompt: vi.fn(),
}));

vi.mock('@/lib/db/sessions', () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  appendMessage: vi.fn(),
}));

import { POST } from '@/app/api/sessions/stream/route';
import { assembleSystemPrompt } from '@/lib/ai/session';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/sessions/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sessions/stream — extraSkills validation', () => {
  it('returns 400 when extraSkills is not an array', async () => {
    const res = await POST(
      makeRequest({ message: 'hi', mode: 'strategy', extraSkills: 'not-an-array' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/must be an array/i);
    expect(assembleSystemPrompt).not.toHaveBeenCalled();
  });

  it('returns 400 when an extraSkills entry contains invalid characters', async () => {
    const res = await POST(
      makeRequest({
        message: 'hi',
        mode: 'strategy',
        extraSkills: ['ok-name', 'bad name with spaces'],
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid skill name "bad name with spaces"/);
    expect(assembleSystemPrompt).not.toHaveBeenCalled();
  });

  it('returns 400 when an extraSkills entry contains a slash', async () => {
    const res = await POST(
      makeRequest({ message: 'hi', mode: 'strategy', extraSkills: ['has/slash'] })
    );
    expect(res.status).toBe(400);
    expect(assembleSystemPrompt).not.toHaveBeenCalled();
  });

  it('omitting extraSkills passes validated undefined to assembleSystemPrompt', async () => {
    vi.mocked(assembleSystemPrompt).mockResolvedValue({
      systemPrompt: 'sys',
      skillNames: [],
      contextVersionId: 'ctx',
    });
    // The full pipeline beyond this point would fail because createStream is
    // not stubbed to return a real ReadableStream, but the validation gate is
    // what we're asserting — we only need to confirm assembleSystemPrompt was
    // called with extraInstalledSkillNames undefined.
    await POST(makeRequest({ message: 'hi', mode: 'strategy' })).catch(() => {});
    expect(assembleSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ extraInstalledSkillNames: undefined })
    );
  });

  it('valid extraSkills are forwarded to assembleSystemPrompt', async () => {
    vi.mocked(assembleSystemPrompt).mockResolvedValue({
      systemPrompt: 'sys',
      skillNames: ['foo'],
      contextVersionId: 'ctx',
    });
    await POST(
      makeRequest({
        message: 'hi',
        mode: 'strategy',
        extraSkills: ['valid-name', 'another_one'],
      })
    ).catch(() => {});
    expect(assembleSystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        extraInstalledSkillNames: ['valid-name', 'another_one'],
      })
    );
  });
});
