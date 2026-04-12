/**
 * Session Title Generation API — app/api/sessions/title/route.ts
 *
 * What it does: Auto-generates a short descriptive title for an AI session
 *   based on the first user/assistant exchange. Called in the background
 *   after the first AI response is received.
 *
 * What it reads from: The request body (sessionId, userMessage, assistantMessage)
 *   and the Anthropic API for title generation.
 *
 * What it produces: A 5-8 word session title, persisted to the database
 *   and returned as JSON.
 *
 * Edge cases:
 *   - AI failure: returns 500 with error details.
 *   - Messages are truncated to 500 chars to keep the title prompt small.
 *   - Generated title is stripped of surrounding quotes.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { sendMessage } from '@/lib/ai/client';
import { getSession, updateSessionTitle } from '@/lib/db/sessions';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import { aiRateLimiter } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!aiRateLimiter.check(auth.id)) {
    return NextResponse.json({ error: 'Too many AI requests. Please wait.' }, { status: 429 });
  }

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const { sessionId, userMessage, assistantMessage } = body as {
    sessionId?: string;
    userMessage?: string;
    assistantMessage?: string;
  };

  if (!sessionId || !userMessage) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  try {
    // Fetch session and verify ownership before modifying
    const session = await getSession(sessionId as string);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (session.createdBy !== auth.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await sendMessage({
      system: 'Generate a short title (5-8 words max) for a marketing session based on this first exchange. Return ONLY the title text, no quotes or formatting.',
      messages: [
        {
          role: 'user',
          content: `User asked: "${(userMessage as string).substring(0, 500)}"\n\nAssistant started with: "${((assistantMessage as string) || '').substring(0, 500)}"`,
        },
      ],
      maxTokens: 50,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    const title = result.content.trim().replace(/^["']|["']$/g, '');
    await updateSessionTitle(sessionId as string, title);

    return NextResponse.json({ title });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to generate session title') },
      { status: 500 }
    );
  }
}
