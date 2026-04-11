import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/db/sessions';

/**
 * Generates a deterministic share token for a session.
 * The token is a truncated SHA-256 hash of the session ID + a secret,
 * so it can be validated without storing anything in the database.
 */
function generateShareToken(sessionId: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not configured — cannot generate share tokens');
  }
  return crypto
    .createHash('sha256')
    .update(sessionId + secret)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Timing-safe comparison for share tokens to prevent timing attacks.
 */
function verifyShareToken(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(provided, 'utf-8'),
    Buffer.from(expected, 'utf-8')
  );
}

/**
 * POST /api/sessions/[id]/share
 * Generates (or returns) the share URL for a session.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const session = await getSession(params.id);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  let token: string;
  try {
    token = generateShareToken(params.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate share link' },
      { status: 500 }
    );
  }

  const shareUrl = `/shared/session/${params.id}?token=${token}`;

  return NextResponse.json({ shareUrl });
}

/**
 * GET /api/sessions/[id]/share?token=...
 * Validates the share token and returns session data for public viewing.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return NextResponse.json(
      { error: 'Missing share token' },
      { status: 400 }
    );
  }

  let expectedToken: string;
  try {
    expectedToken = generateShareToken(params.id);
  } catch {
    return NextResponse.json(
      { error: 'Sharing is not configured on this instance' },
      { status: 500 }
    );
  }

  if (!verifyShareToken(token, expectedToken)) {
    return NextResponse.json(
      { error: 'Invalid or expired link' },
      { status: 403 }
    );
  }

  const session = await getSession(params.id);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Return a read-only subset of session data
  return NextResponse.json({
    session: {
      id: session.id,
      title: session.title,
      mode: session.mode,
      messages: session.messages,
      createdAt: session.createdAt,
      campaign: session.campaign,
    },
  });
}
