import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendMessage } from '@/lib/ai/client';
import { getActiveContext } from '@/lib/db/context';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { goal?: string; description?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { goal, description } = body;

  if (!goal || typeof goal !== 'string' || !goal.trim()) {
    return NextResponse.json(
      { error: 'Campaign goal is required for AI assist' },
      { status: 400 }
    );
  }

  // Load active context for ICP and positioning
  const context = await getActiveContext();

  let contextInfo = '';
  if (context) {
    const parts: string[] = [];
    if (context.positioningStatement) {
      parts.push(`Positioning: ${context.positioningStatement}`);
    }
    if (context.icpDefinition) {
      parts.push(
        `ICP: ${typeof context.icpDefinition === 'string' ? context.icpDefinition : JSON.stringify(context.icpDefinition)}`
      );
    }
    if (context.messagingPillars) {
      parts.push(
        `Messaging Pillars: ${typeof context.messagingPillars === 'string' ? context.messagingPillars : JSON.stringify(context.messagingPillars)}`
      );
    }
    if (parts.length > 0) {
      contextInfo = `\n\nProduct Marketing Context:\n${parts.join('\n')}`;
    }
  }

  const result = await sendMessage({
    system: `You are a marketing strategist helping plan a campaign. Based on the campaign goal, description, and any available product marketing context, suggest channels, success metrics, and brief strategic notes.

Respond with ONLY valid JSON in this exact format — no markdown, no code fences:
{"channels": ["channel1", "channel2"], "metrics": ["metric1", "metric2"], "notes": "Brief strategic notes about the campaign approach."}

Guidelines:
- Suggest 3-6 relevant marketing channels based on the ICP and goal
- Suggest 3-5 measurable success metrics
- Keep the strategic notes to 2-3 sentences
- Channel names should be short labels (e.g. "Email", "LinkedIn", "Google Ads", "Blog", "Webinars")`,
    messages: [
      {
        role: 'user',
        content: `Campaign Goal: ${goal.trim()}${description ? `\nDescription: ${description.trim()}` : ''}${contextInfo}`,
      },
    ],
    maxTokens: 1024,
  });

  if (result.error) {
    return NextResponse.json(
      { error: result.error.message },
      { status: 500 }
    );
  }

  try {
    const parsed = JSON.parse(result.content) as {
      channels: string[];
      metrics: string[];
      notes: string;
    };
    return NextResponse.json({
      channels: Array.isArray(parsed.channels) ? parsed.channels : [],
      metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    });
  } catch {
    return NextResponse.json({
      channels: [],
      metrics: [],
      notes: result.content,
    });
  }
}
