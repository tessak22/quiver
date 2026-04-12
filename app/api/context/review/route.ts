import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/utils';
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
  const body = parsed.data;

  const {
    positioningStatement,
    icpDefinition,
    messagingPillars,
    competitiveLandscape,
    customerLanguage,
    proofPoints,
    activeHypotheses,
    brandVoice,
    wordsToUse,
    wordsToAvoid,
  } = body;

  // Build a summary of the context for the AI to review
  const contextSummary = [
    positioningStatement ? `Positioning Statement:\n${positioningStatement}` : null,
    icpDefinition ? `ICP Definition:\n${typeof icpDefinition === 'string' ? icpDefinition : JSON.stringify(icpDefinition, null, 2)}` : null,
    messagingPillars ? `Messaging Pillars:\n${typeof messagingPillars === 'string' ? messagingPillars : JSON.stringify(messagingPillars, null, 2)}` : null,
    competitiveLandscape ? `Competitive Landscape:\n${JSON.stringify(competitiveLandscape, null, 2)}` : null,
    customerLanguage ? `Customer Language:\n${typeof customerLanguage === 'string' ? customerLanguage : JSON.stringify(customerLanguage, null, 2)}` : null,
    proofPoints ? `Proof Points:\n${typeof proofPoints === 'string' ? proofPoints : JSON.stringify(proofPoints, null, 2)}` : null,
    activeHypotheses ? `Active Hypotheses:\n${typeof activeHypotheses === 'string' ? activeHypotheses : JSON.stringify(activeHypotheses, null, 2)}` : null,
    brandVoice ? `Brand Voice:\n${brandVoice}` : null,
    Array.isArray(wordsToUse) && wordsToUse.length > 0 ? `Words to Use:\n${(wordsToUse as string[]).join(', ')}` : null,
    Array.isArray(wordsToAvoid) && wordsToAvoid.length > 0 ? `Words to Avoid:\n${(wordsToAvoid as string[]).join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');

  if (!contextSummary.trim()) {
    return NextResponse.json({
      issues: ['All context fields are empty. Fill in at least a few sections before reviewing.'],
      isConsistent: false,
    });
  }

  const result = await sendMessage({
    system: `You are a product marketing expert reviewing a company's marketing context for internal consistency. Analyze the provided context and check for:

1. Internal consistency: Does the positioning align with the ICP? Do messaging pillars support the positioning? Does the brand voice match the customer language?
2. Contradictions: Are there any fields that contradict each other?
3. Missing connections: Are there obvious gaps where fields should reference or support each other but don't?

Respond with ONLY valid JSON in this exact format — no markdown, no code fences:
{"issues": ["issue 1 description", "issue 2 description"], "isConsistent": true}

If there are no issues, return an empty issues array and isConsistent: true.
If there are issues, list each one clearly and set isConsistent to false.
Keep each issue description concise (1-2 sentences).`,
    messages: [
      {
        role: 'user',
        content: `Review this product marketing context for consistency:\n\n${contextSummary}`,
      },
    ],
    maxTokens: 2048,
  });

  if (result.error) {
    return NextResponse.json(
      { error: result.error.message },
      { status: 500 }
    );
  }

  try {
    const parsedResult = JSON.parse(result.content) as { issues: string[]; isConsistent: boolean };
    return NextResponse.json({
      issues: Array.isArray(parsedResult.issues) ? parsedResult.issues : [],
      isConsistent: Boolean(parsedResult.isConsistent),
    });
  } catch {
    // If AI didn't return valid JSON, wrap its response as a single issue
    return NextResponse.json({
      issues: [result.content],
      isConsistent: false,
    });
  }
}
