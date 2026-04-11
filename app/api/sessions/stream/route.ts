import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createStream } from '@/lib/ai/client';
import { assembleSystemPrompt } from '@/lib/ai/session';
import { createSession, getSession, appendMessage } from '@/lib/db/sessions';
import type { SessionMode, ArtifactType } from '@/types';

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
  const { sessionId, message, mode, artifactType, campaignId } = body as {
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
    // Get or create session
    let currentSessionId = sessionId;
    let existingMessages: Array<{ role: string; content: string }> = [];

    if (currentSessionId) {
      const session = await getSession(currentSessionId);
      if (!session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      existingMessages = (Array.isArray(session.messages) ? session.messages : []) as Array<{ role: string; content: string }>;
    }

    // Assemble system prompt
    const { systemPrompt, skillNames, contextVersionId } =
      await assembleSystemPrompt({
        mode,
        artifactType,
        campaignId,
      });

    // Create session if new
    if (!currentSessionId) {
      const session = await createSession({
        mode,
        skillsLoaded: skillNames,
        campaignId,
        contextVersionId,
        createdBy: user.id,
      });
      currentSessionId = session.id;
    }

    // Build message history for API
    const apiMessages = [
      ...existingMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // User message is saved inside the stream handler after streaming succeeds,
    // to avoid orphaned messages if the stream fails.
    const userTimestamp = new Date().toISOString();

    // Create streaming response
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

    // Wrap the stream to:
    // 1. Collect the full response for saving
    // 2. Detect [ARTIFACT READY] markers
    // 3. Emit session ID in first chunk
    const encoder = new TextEncoder();
    let fullResponse = '';
    let artifactReadyEmitted = false;

    const wrappedStream = new ReadableStream({
      async start(controller) {
        // Send session ID as first SSE event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'session_id', sessionId: currentSessionId })}\n\n`)
        );

        const reader = result.stream.getReader();
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
          await appendMessage(currentSessionId!, {
            role: 'user',
            content: message,
            timestamp: userTimestamp,
          });
          await appendMessage(currentSessionId!, {
            role: 'assistant',
            content: fullResponse,
            timestamp: new Date().toISOString(),
          });

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

    return new Response(wrappedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
