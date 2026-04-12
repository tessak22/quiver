/**
 * In-memory rate limiter — lib/rate-limit.ts
 *
 * Provides a simple per-IP sliding-window rate limiter for public API routes.
 * Each RateLimiter instance maintains its own map of IP counts and reset times.
 *
 * This is an in-memory implementation. On multi-instance deployments (e.g.
 * multiple Vercel function instances), each instance tracks independently.
 * For stronger guarantees, swap to a Redis-backed implementation.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private map = new Map<string, RateLimitEntry>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  /**
   * @param maxRequests Maximum requests per window
   * @param windowMs Window duration in milliseconds
   */
  constructor(
    private readonly maxRequests: number = 60,
    private readonly windowMs: number = 60_000
  ) {
    // Clean up stale entries every 5 minutes to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      this.map.forEach((entry, key) => {
        if (now > entry.resetAt) {
          this.map.delete(key);
        }
      });
    }, 300_000);
  }

  /**
   * Check if a request from the given IP is allowed.
   * Returns true if allowed, false if rate limited.
   */
  check(ip: string): boolean {
    const now = Date.now();
    const entry = this.map.get(ip);

    if (!entry || now > entry.resetAt) {
      this.map.set(ip, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  /** Stop the cleanup interval (for testing). */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

/**
 * Extract client IP from request headers.
 * Prefers x-real-ip (set by Vercel from actual connection) over
 * x-forwarded-for (which can be spoofed by the client).
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * Shared rate limiter for public content API routes.
 * 60 requests per minute per IP.
 */
export const publicContentLimiter = new RateLimiter(60, 60_000);

/**
 * Rate limiter for AI-calling endpoints.
 * 20 requests per minute per user ID.
 */
export const aiRateLimiter = new RateLimiter(20, 60_000);
