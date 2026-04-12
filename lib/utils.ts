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
 * Parse an ISO date string, returning null if invalid.
 * Replaces the repeated date-parsing + isNaN check pattern.
 */
export function parseISODate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
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
