import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getSession } from '@/lib/db/sessions';
import { safeErrorMessage } from '@/lib/utils';

/**
 * Generates a deterministic share token for a session.
 * The token is a truncated SHA-256 hash of the session ID + a secret,
 * so it can be validated without storing anything in the database.
 * Produces a 128-bit (32 hex character) token.
 */
function generateShareToken(sessionId: string): string {
  const secret = process.env.QUIVER_SHARE_SECRET;
  if (!secret) {
    throw new Error('QUIVER_SHARE_SECRET is not configured — cannot generate share tokens. Set it in your environment variables.');
  }
  return crypto
    .createHash('sha256')
    .update(sessionId + secret)
    .digest('hex')
    .substring(0, 32);
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
  const auth = await requireRole('member');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const session = await getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.createdBy !== auth.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to generate share link') },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sessions/[id]/share?token=...
 * Validates the share token and returns session data for public viewing.
 * This is a public endpoint — no auth required (token IS the auth).
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

  try {
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
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch shared session') },
      { status: 500 }
    );
  }
}
