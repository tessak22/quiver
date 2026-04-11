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
import { createClient } from '@/lib/supabase/server';
import { sendMessage } from '@/lib/ai/client';
import { updateSessionTitle } from '@/lib/db/sessions';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { sessionId, userMessage, assistantMessage } = body;

  if (!sessionId || !userMessage) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const result = await sendMessage({
    system: 'Generate a short title (5-8 words max) for a marketing session based on this first exchange. Return ONLY the title text, no quotes or formatting.',
    messages: [
      {
        role: 'user',
        content: `User asked: "${userMessage.substring(0, 500)}"\n\nAssistant started with: "${(assistantMessage || '').substring(0, 500)}"`,
      },
    ],
    maxTokens: 50,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const title = result.content.trim().replace(/^["']|["']$/g, '');
  await updateSessionTitle(sessionId, title);

  return NextResponse.json({ title });
}
