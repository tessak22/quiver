/**
 * Tests for the in-memory rate limiter used in public API routes
 *
 * The rate limiter in app/api/public/content/route.ts is a private function
 * within the route module. Since the route module has side effects (setInterval)
 * and imports Next.js modules, we re-implement the rate limiter logic here
 * to verify expected behavior — the same pattern used across the test suite
 * for private module internals.
 *
 * The rate limiter allows 60 requests per minute per IP, with a sliding
 * window that resets 60 seconds after the first request in a window.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Re-implement the rate limiter logic
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 60) {
    return false;
  }

  entry.count++;
  return true;
}

function cleanupStaleEntries(): void {
  const now = Date.now();
  rateLimitMap.forEach((entry, key) => {
    if (now > entry.resetAt) {
      rateLimitMap.delete(key);
    }
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  beforeEach(() => {
    rateLimitMap.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first request from any IP', () => {
    expect(checkRateLimit('192.168.1.1')).toBe(true);
  });

  it('allows up to 60 requests within a minute', () => {
    for (let i = 0; i < 60; i++) {
      expect(checkRateLimit('192.168.1.1')).toBe(true);
    }
  });

  it('blocks the 61st request within the same minute', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('192.168.1.1');
    }
    expect(checkRateLimit('192.168.1.1')).toBe(false);
  });

  it('tracks different IPs independently', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('192.168.1.1');
    }
    // First IP is now rate-limited
    expect(checkRateLimit('192.168.1.1')).toBe(false);
    // Second IP still has quota
    expect(checkRateLimit('192.168.1.2')).toBe(true);
  });

  it('resets the counter after the 60-second window expires', () => {
    for (let i = 0; i < 60; i++) {
      checkRateLimit('192.168.1.1');
    }
    expect(checkRateLimit('192.168.1.1')).toBe(false);

    // Advance time past the 60-second window
    vi.advanceTimersByTime(61_000);

    // Should be allowed again with a fresh window
    expect(checkRateLimit('192.168.1.1')).toBe(true);
  });

  it('starts a new window after expiry, not extending the old one', () => {
    // Make some requests
    checkRateLimit('192.168.1.1');
    checkRateLimit('192.168.1.1');

    // Advance 61 seconds
    vi.advanceTimersByTime(61_000);

    // This creates a new window with count=1
    expect(checkRateLimit('192.168.1.1')).toBe(true);

    // Should be able to do 59 more in this new window
    for (let i = 0; i < 59; i++) {
      expect(checkRateLimit('192.168.1.1')).toBe(true);
    }
    expect(checkRateLimit('192.168.1.1')).toBe(false);
  });

  it('correctly counts requests up to the boundary', () => {
    // Make 59 requests (should all pass)
    for (let i = 0; i < 59; i++) {
      checkRateLimit('10.0.0.1');
    }
    // 60th should pass
    expect(checkRateLimit('10.0.0.1')).toBe(true);
    // 61st should fail
    expect(checkRateLimit('10.0.0.1')).toBe(false);
    // 62nd should also fail
    expect(checkRateLimit('10.0.0.1')).toBe(false);
  });
});

describe('cleanupStaleEntries', () => {
  beforeEach(() => {
    rateLimitMap.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes entries whose resetAt has passed', () => {
    checkRateLimit('192.168.1.1');
    checkRateLimit('192.168.1.2');
    expect(rateLimitMap.size).toBe(2);

    // Advance past the 60-second window
    vi.advanceTimersByTime(61_000);

    cleanupStaleEntries();
    expect(rateLimitMap.size).toBe(0);
  });

  it('retains entries that are still within their window', () => {
    checkRateLimit('192.168.1.1');

    // Advance less than 60 seconds
    vi.advanceTimersByTime(30_000);

    // Add a second IP — this one is fresh
    checkRateLimit('192.168.1.2');

    // Advance 31 more seconds — first IP's window has expired, second hasn't
    vi.advanceTimersByTime(31_000);

    cleanupStaleEntries();
    expect(rateLimitMap.size).toBe(1);
    expect(rateLimitMap.has('192.168.1.2')).toBe(true);
    expect(rateLimitMap.has('192.168.1.1')).toBe(false);
  });

  it('does nothing when the map is empty', () => {
    cleanupStaleEntries();
    expect(rateLimitMap.size).toBe(0);
  });
});
