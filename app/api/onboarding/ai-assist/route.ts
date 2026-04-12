import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { parseJsonBody } from '@/lib/utils';
import { aiRateLimiter } from '@/lib/rate-limit';
import { sendMessage } from '@/lib/ai/client';

const STEP_PROMPTS: Record<number, (data: Record<string, string>) => string> = {
  1: (data) => `The user is setting up their marketing context. They provided:
Product name: ${data.productName}
One-liner: ${data.oneLiner}
Category: ${data.productCategory || 'not provided'}
Business model: ${data.businessModel || 'not provided'}

Draft a refined, punchy one-liner for this product. Return ONLY a JSON object: {"oneLiner": "your refined one-liner"}`,

  2: (data) => `The user described their target audience:
ICP: ${data.icpDefinition}
Decision maker: ${data.decisionMaker || 'not provided'}
Primary use case: ${data.primaryUseCase || 'not provided'}
Jobs to be done: ${data.jobsToBeDone || 'not provided'}

Structure this into a clean ICP definition. Return ONLY a JSON object:
{"icpDefinition": "structured ICP paragraph", "jobsToBeDone": "structured list of jobs"}`,

  3: (data) => `The user described their positioning:
Product: ${data.productName} — ${data.oneLiner}
Core problem: ${data.coreProblem}
Why alternatives fall short: ${data.whyAlternativesFallShort || 'not provided'}
Key differentiators: ${data.keyDifferentiators || 'not provided'}

Draft a positioning statement. Return ONLY a JSON object:
{"positioningStatement": "For [target], [product] is the [category] that [key benefit] unlike [alternatives] because [differentiator]."}`,

  4: (data) => `The user described their messaging:
Product: ${data.productName}
Value pillars: ${data.valuePillars}
Customer language: ${data.customerLanguage || 'not provided'}

Structure these into VBF messaging pillars (Value, Benefit, Feature for each). Return ONLY a JSON object:
{"valuePillars": "structured pillars, one per line with Value | Benefit | Feature format"}`,
};

export async function POST(request: Request) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!aiRateLimiter.check(auth.id)) {
    return NextResponse.json({ error: 'Too many AI requests. Please wait.' }, { status: 429 });
  }

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const { step, data } = parsed.data;

  const promptFn = STEP_PROMPTS[step as number];
  if (!promptFn) {
    return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
  }

  const result = await sendMessage({
    system: 'You are helping a product team set up their marketing context. Be concise and specific. Always return valid JSON only, no markdown formatting.',
    messages: [{ role: 'user', content: promptFn(data as Record<string, string>) }],
    maxTokens: 1024,
  });

  if (result.error) {
    return NextResponse.json(
      { error: result.error.message },
      { status: 500 }
    );
  }

  try {
    // Parse AI response as JSON
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ suggestions: {} });
    }
    const suggestions = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: {} });
  }
}
