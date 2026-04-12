import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createStream } from '@/lib/ai/client';
import { assembleSystemPrompt } from '@/lib/ai/session';
import { createSession, getSession, appendMessage } from '@/lib/db/sessions';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import { aiRateLimiter } from '@/lib/rate-limit';
import type { SessionMode, ArtifactType } from '@/types';

/**
 * Persist the user and assistant messages to the session after streaming completes.
 */
async function persistMessages(
  sessionId: string,
  userMessage: string,
  userTimestamp: string,
  assistantContent: string
): Promise<void> {
  await appendMessage(sessionId, {
    role: 'user',
    content: userMessage,
    timestamp: userTimestamp,
  });
  await appendMessage(sessionId, {
    role: 'assistant',
    content: assistantContent,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create a ReadableStream that wraps the AI stream, emitting SSE events.
 * Responsibilities:
 *   1. Emits the session ID as the first event
 *   2. Forwards text chunks as SSE events
 *   3. Detects [ARTIFACT READY] markers mid-stream
 *   4. Persists messages after streaming completes
 */
function createSSEStream(
  aiStream: ReadableStream,
  sessionId: string,
  userMessage: string,
  userTimestamp: string
): ReadableStream {
  const encoder = new TextEncoder();
  let fullResponse = '';
  let artifactReadyEmitted = false;

  return new ReadableStream({
    async start(controller) {
      // Send session ID as first SSE event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'session_id', sessionId })}\n\n`)
      );

      const reader = aiStream.getReader();
      const decoder = new TextDecoder();

      let controllerClosed = false;

      function safeEnqueue(data: Uint8Array) {
        if (!controllerClosed) controller.enqueue(data);
      }

      function safeClose() {
        if (!controllerClosed) {
          controllerClosed = true;
          controller.close();
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          fullResponse += text;

          // Send text chunk as SSE
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`)
          );

          // Check for artifact marker in accumulated response (one-shot)
          if (!artifactReadyEmitted) {
            const markerMatch = fullResponse.match(
              /\[ARTIFACT READY\s*[—–-]\s*type:\s*([^\|]+)\|\s*suggested title:\s*([^\]]+)\]/i
            );
            if (markerMatch) {
              artifactReadyEmitted = true;
              safeEnqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: 'artifact_ready',
                    artifactType: markerMatch[1].trim(),
                    suggestedTitle: markerMatch[2].trim(),
                  })}\n\n`
                )
              );
            }
          }
        }

        // Flush any remaining bytes from the decoder
        const remaining = decoder.decode();
        if (remaining) {
          fullResponse += remaining;
          safeEnqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text', content: remaining })}\n\n`)
          );
        }

        // Save both messages after streaming completes successfully
        await persistMessages(sessionId, userMessage, userTimestamp, fullResponse);

        // Send done event
        safeEnqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        );

        safeClose();
      } catch (err) {
        safeEnqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: err instanceof Error ? err.message : 'Stream error' })}\n\n`
          )
        );
        safeClose();
      }
    },
  });
}

export async function POST(request: Request) {
  // 1. Authenticate
  const auth = await requireRole('member');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Rate limit
  if (!aiRateLimiter.check(auth.id)) {
    return NextResponse.json({ error: 'Too many AI requests. Please wait.' }, { status: 429 });
  }

  // 3. Parse and validate request body
  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;

  const { sessionId, message, mode, artifactType, campaignId } = parsed.data as {
    sessionId?: string;
    message: string;
    mode: SessionMode;
    artifactType?: ArtifactType;
    campaignId?: string;
  };

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  try {
    // 4. Resolve session — load existing or prepare for creation
    let currentSessionId = sessionId;
    let existingMessages: Array<{ role: string; content: string }> = [];

    if (currentSessionId) {
      const session = await getSession(currentSessionId);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      // Verify ownership when continuing an existing session
      if (session.createdBy !== auth.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      existingMessages = (Array.isArray(session.messages) ? session.messages : []) as Array<{ role: string; content: string }>;
    }

    // 5. Assemble system prompt
    const { systemPrompt, skillNames, contextVersionId } =
      await assembleSystemPrompt({
        mode,
        artifactType,
        campaignId,
      });

    // 6. Create session if new
    if (!currentSessionId) {
      const session = await createSession({
        mode,
        skillsLoaded: skillNames,
        campaignId,
        contextVersionId,
        createdBy: auth.id,
      });
      currentSessionId = session.id;
    }

    // 7. Build message history for API
    const apiMessages = [
      ...existingMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    const userTimestamp = new Date().toISOString();

    // 8. Create AI stream
    const result = createStream({
      system: systemPrompt,
      messages: apiMessages,
    });

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 500 }
      );
    }

    // 9. Wrap stream and return response
    const wrappedStream = createSSEStream(
      result.stream,
      currentSessionId!,
      message,
      userTimestamp
    );

    return new Response(wrappedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Internal error') },
      { status: 500 }
    );
  }
}
