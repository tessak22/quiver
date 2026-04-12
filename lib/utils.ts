import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { NextResponse } from "next/server"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a JSON request body, returning the parsed object or a 400 NextResponse.
 */
export async function parseJsonBody(request: Request): Promise<
  { data: Record<string, unknown>; error?: never } |
  { data?: never; error: NextResponse }
> {
  try {
    const data = await request.json();
    return { data };
  } catch {
    return { error: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }) };
  }
}

/**
 * Pick only the defined (non-undefined) keys from an object.
 * Replaces the repeated `if (data.x !== undefined) update.x = data.x` pattern.
 */
export function pickDefined<T extends Record<string, unknown>>(
  obj: T,
  keys: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};
  for (const key of keys) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Parse an ISO date string with strict validation, returning null if invalid.
 * Rejects lenient Date parsing (e.g. "2024-02-31" normalizing to March 2)
 * by constructing a date from the extracted components and verifying round-trip.
 *
 * Accepts date-only ("2024-01-15") and full ISO-8601 with optional timezone
 * offsets ("2024-01-15T10:30:00+02:00"). Component validation uses a
 * UTC-constructed reference date so timezone offsets don't cause false
 * rejections.
 */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export function parseISODate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const match = value.match(ISO_DATE_RE);
  if (!match) return null;

  const date = new Date(value);
  if (isNaN(date.getTime())) return null;

  // Validate date components by constructing a UTC reference from the
  // input year/month/day. If Date normalized them (e.g. Feb 31 → Mar 3),
  // the reference will differ from the input.
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const ref = new Date(Date.UTC(year, month - 1, day));

  if (ref.getUTCFullYear() !== year || ref.getUTCMonth() + 1 !== month || ref.getUTCDate() !== day) {
    return null;
  }

  return date;
}

/**
 * Extract a safe error message from an unknown error.
 * Avoids leaking Prisma internals or stack traces to clients.
 */
export function safeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const msg = err.message;
    // Don't leak Prisma internal details
    if (msg.includes('prisma') || msg.includes('Invalid `prisma') || msg.includes('PrismaClient')) {
      return fallback;
    }
    return msg;
  }
  return fallback;
}
