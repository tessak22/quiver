import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import { aiRateLimiter } from '@/lib/rate-limit';
import { sendMessage } from '@/lib/ai/client';

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!aiRateLimiter.check(auth.id)) {
    return NextResponse.json({ error: 'Too many AI requests. Please wait.' }, { status: 429 });
  }

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;

  const text = parsed.data.text;
  if (typeof text !== 'string' || !text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const result = await sendMessage({
    system: `You are a product marketing data extraction assistant.

Your job is to read a document — in any format (markdown, prose, bullet lists, slides, etc.) — and extract product marketing context fields.

Return ONLY valid JSON matching this exact schema — no markdown fences, no explanation:

{
  "positioningStatement": "string or null",
  "icpDefinition": "string or null",
  "messagingPillars": "string or null",
  "competitiveLandscape": [{ "name": "string", "notes": "string" }],
  "customerLanguage": "string or null",
  "proofPoints": "string or null",
  "activeHypotheses": "string or null",
  "brandVoice": "string or null",
  "wordsToUse": ["string"],
  "wordsToAvoid": ["string"]
}

Field guidance:
- positioningStatement: The core value proposition or positioning sentence/paragraph.
- icpDefinition: Description of the ideal customer profile — who they are, their role, company size, pain points.
- messagingPillars: The key themes or pillars that underpin the marketing message. Preserve as written.
- competitiveLandscape: Competitors mentioned with notes about their positioning or differentiators.
- customerLanguage: Phrases, vocabulary, or language patterns the customers use themselves.
- proofPoints: Evidence, stats, testimonials, or outcomes that validate the positioning.
- activeHypotheses: Assumptions or hypotheses the team is currently testing.
- brandVoice: Tone of voice guidance — adjectives, do/don't examples, personality description.
- wordsToUse: Specific words or phrases to include in marketing copy.
- wordsToAvoid: Specific words or phrases to avoid.

If a field cannot be found in the document, set it to null (or [] for array fields).
Do not invent content — only extract what is present in the document.`,
    messages: [
      {
        role: 'user',
        content: `Extract the product marketing context fields from this document:\n\n${text}`,
      },
    ],
    maxTokens: 2048,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  try {
    // Strip markdown code fences if the model wrapped the JSON anyway
    const raw = result.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const extracted = JSON.parse(raw) as Record<string, unknown>;

    return NextResponse.json({
      data: {
        positioningStatement: typeof extracted.positioningStatement === 'string' ? extracted.positioningStatement : '',
        icpDefinition: typeof extracted.icpDefinition === 'string' ? extracted.icpDefinition : '',
        messagingPillars: typeof extracted.messagingPillars === 'string' ? extracted.messagingPillars : '',
        competitiveLandscape: Array.isArray(extracted.competitiveLandscape)
          ? (extracted.competitiveLandscape as unknown[])
              .filter((e): e is { name: unknown; notes: unknown } =>
                typeof e === 'object' && e !== null && 'name' in e
              )
              .map((e) => ({
                name: typeof e.name === 'string' ? e.name : String(e.name ?? ''),
                notes: typeof e.notes === 'string' ? e.notes : String(e.notes ?? ''),
              }))
          : [],
        customerLanguage: typeof extracted.customerLanguage === 'string' ? extracted.customerLanguage : '',
        proofPoints: typeof extracted.proofPoints === 'string' ? extracted.proofPoints : '',
        activeHypotheses: typeof extracted.activeHypotheses === 'string' ? extracted.activeHypotheses : '',
        brandVoice: typeof extracted.brandVoice === 'string' ? extracted.brandVoice : '',
        wordsToUse: Array.isArray(extracted.wordsToUse)
          ? (extracted.wordsToUse as unknown[]).filter((w): w is string => typeof w === 'string')
          : [],
        wordsToAvoid: Array.isArray(extracted.wordsToAvoid)
          ? (extracted.wordsToAvoid as unknown[]).filter((w): w is string => typeof w === 'string')
          : [],
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'AI returned unparseable output') },
      { status: 500 }
    );
  }
}
