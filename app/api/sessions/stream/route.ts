import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createStream } from '@/lib/ai/client';
import { assembleSystemPrompt } from '@/lib/ai/session';
import { isValidSkillName } from '@/lib/ai/skills';
import { createSession, getSession, appendMessage } from '@/lib/db/sessions';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import { aiRateLimiter } from '@/lib/rate-limit';
import type { ContentBlockParam, ImageBlockParam, DocumentBlockParam, TextBlockParam, Base64ImageSource } from '@anthropic-ai/sdk/resources/messages';
import type { SessionMode, ArtifactType, AttachmentPayload } from '@/types';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ALLOWED_TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'text/x-markdown']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/markdown', 'text/x-markdown',
]);
// 3 MB cap: base64 inflates by ~33%, keeping encoded payload well under Vercel's ~4.5 MB limit
const MAX_ATTACHMENT_SIZE_BYTES = 3 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;



/**
 * Converts client attachment payloads into Anthropic content blocks.
 * Text/markdown files are prepended as fenced code blocks in the text block.
 */
function buildUserContent(messageText: string, attachments: AttachmentPayload[]): string | ContentBlockParam[] {
  if (!attachments.length) return messageText;

  const blocks: ContentBlockParam[] = [];
  let textPrefix = '';

  for (const att of attachments) {
    if (ALLOWED_IMAGE_TYPES.has(att.mimeType)) {
      const source: Base64ImageSource = {
        type: 'base64',
        media_type: att.mimeType as Base64ImageSource['media_type'],
        data: att.data,
      };
      const imageBlock: ImageBlockParam = { type: 'image', source };
      blocks.push(imageBlock);
    } else if (att.mimeType === 'application/pdf') {
      const docBlock: DocumentBlockParam = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: att.data },
        title: att.name,
      };
      blocks.push(docBlock);
    } else if (ALLOWED_TEXT_TYPES.has(att.mimeType)) {
      textPrefix += `[File: ${att.name}]\n\`\`\`\n${att.data}\n\`\`\`\n\n`;
    }
  }

  const textBlock: TextBlockParam = { type: 'text', text: textPrefix + messageText };
  blocks.push(textBlock);
  return blocks;
}

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

  const { sessionId, message, mode, artifactType, campaignId, extraSkills, attachments } = parsed.data as {
    sessionId?: string;
    message: string;
    mode: SessionMode;
    artifactType?: ArtifactType;
    campaignId?: string;
    extraSkills?: string[];
    attachments?: AttachmentPayload[];
  };

  const validatedAttachments: AttachmentPayload[] = [];
  if (attachments !== undefined) {
    if (!Array.isArray(attachments)) {
      return NextResponse.json({ error: 'attachments must be an array' }, { status: 400 });
    }
    if (attachments.length > MAX_ATTACHMENTS) {
      return NextResponse.json({ error: `Maximum ${MAX_ATTACHMENTS} attachments per message` }, { status: 400 });
    }
    for (const att of attachments) {
      if (typeof att.name !== 'string' || typeof att.mimeType !== 'string' || typeof att.data !== 'string') {
        return NextResponse.json({ error: 'Invalid attachment format' }, { status: 400 });
      }
      if (!ALLOWED_MIME_TYPES.has(att.mimeType)) {
        return NextResponse.json({ error: `Unsupported file type: ${att.mimeType}` }, { status: 400 });
      }
      const isText = ALLOWED_TEXT_TYPES.has(att.mimeType);
      const byteLength = isText
        ? Buffer.byteLength(att.data, 'utf8')
        : Buffer.byteLength(att.data, 'base64');
      if (byteLength > MAX_ATTACHMENT_SIZE_BYTES) {
        return NextResponse.json({ error: `Attachment "${att.name}" exceeds 3 MB limit` }, { status: 400 });
      }
      validatedAttachments.push(att);
    }
  }

  const hasContent = (message && typeof message === 'string') || validatedAttachments.length > 0;
  if (!hasContent) {
    return NextResponse.json({ error: 'Message or at least one attachment is required' }, { status: 400 });
  }

  // Validate extraSkills at the boundary so malformed names produce a 400
  // instead of bubbling into a 500 from loadSkills().
  let validatedExtraSkills: string[] | undefined;
  if (extraSkills !== undefined) {
    if (!Array.isArray(extraSkills)) {
      return NextResponse.json(
        { error: 'extraSkills must be an array of skill names.' },
        { status: 400 }
      );
    }
    const stringNames = extraSkills.filter((s): s is string => typeof s === 'string');
    const invalid = stringNames.find((s) => !isValidSkillName(s));
    if (invalid !== undefined) {
      return NextResponse.json(
        {
          error: `Invalid skill name "${invalid}". Skill names may only contain letters, numbers, hyphens, and underscores.`,
        },
        { status: 400 }
      );
    }
    validatedExtraSkills = stringNames;
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
        extraInstalledSkillNames: validatedExtraSkills,
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
      { role: 'user' as const, content: buildUserContent(message ?? '', validatedAttachments) },
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
    // Persist a readable label when the user sent attachments with no text
    const persistedMessage = message || validatedAttachments.map((a) => a.name).join(', ');
    const wrappedStream = createSSEStream(
      result.stream,
      currentSessionId!,
      persistedMessage,
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
