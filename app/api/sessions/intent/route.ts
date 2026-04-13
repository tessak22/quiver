import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { classifyIntent } from '@/lib/ai/intent';
import { safeErrorMessage } from '@/lib/utils';

/**
 * POST /api/sessions/intent
 *
 * Classifies a natural-language prompt into a session mode (and optionally an
 * artifact type for 'create' mode). Used by the New Session page to pre-select
 * the mode before the user confirms.
 *
 * Request body: { prompt: string }  — max 500 characters, non-empty
 * Response:     { mode, artifactType?, confidence, reasoning }
 */
export async function POST(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
  }

  const { prompt } = body as Record<string, unknown>;

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return NextResponse.json(
      { error: 'prompt is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  if (prompt.length > 500) {
    return NextResponse.json(
      { error: 'prompt must be 500 characters or fewer' },
      { status: 400 }
    );
  }

  try {
    const result = await classifyIntent(prompt.trim());

    const response: {
      mode: string;
      artifactType?: string;
      confidence: string;
      reasoning: string;
    } = {
      mode: result.mode,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };

    if (result.artifactType) {
      response.artifactType = result.artifactType;
    }

    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Intent classification failed') },
      { status: 500 }
    );
  }
}
