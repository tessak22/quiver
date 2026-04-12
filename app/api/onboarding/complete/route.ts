import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth';
import { parseJsonBody } from '@/lib/utils';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/db';
import { createContextVersion } from '@/lib/db/context';
import { DEFAULT_CAMPAIGN_NAME } from '@/types';

export async function POST(request: Request) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!auth.email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  // First-run guard: only allow onboarding if no active context exists
  // This prevents authenticated non-members from self-promoting to admin
  const existingContext = await prisma.contextVersion.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  if (existingContext) {
    return NextResponse.json(
      { error: 'Onboarding already completed. Use the context editor to make changes.' },
      { status: 403 }
    );
  }

  // Validate required fields
  if (!data.productName || !data.oneLiner || !data.icpDefinition || !data.coreProblem || !data.valuePillars) {
    return NextResponse.json(
      { error: 'Required fields missing: product name, one-liner, ICP, core problem, value pillars' },
      { status: 400 }
    );
  }

  // Parse arrays from newline-separated strings
  const wordsToUse = data.wordsToUse
    ? (data.wordsToUse as string).split('\n').map((w: string) => w.trim()).filter(Boolean)
    : [];
  const wordsToAvoid = data.wordsToAvoid
    ? (data.wordsToAvoid as string).split('\n').map((w: string) => w.trim()).filter(Boolean)
    : [];

  // Parse competitors into structured JSON
  const competitors = ((data.competitors as Array<{ name: string; notes: string }>) || [])
    .filter((c: { name: string }) => c.name.trim())
    .map((c: { name: string; notes: string }) => ({
      name: c.name.trim(),
      notes: c.notes?.trim() || '',
    }));

  // Parse messaging pillars from freeform text
  const pillars = (data.valuePillars as string)
    .split('\n')
    .filter((line: string) => line.trim())
    .map((line: string) => ({ pillar: line.trim() }));

  // Create team member record for the admin
  const existingMember = await prisma.teamMember.findUnique({
    where: { id: auth.id },
  });

  if (!existingMember) {
    // Access the full Supabase user for metadata
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await prisma.teamMember.create({
      data: {
        id: auth.id,
        name: user?.user_metadata?.name || auth.email.split('@')[0] || 'Admin',
        email: auth.email,
        role: 'admin',
      },
    });
  }

  // Create the first context version via the data layer
  await createContextVersion({
    positioningStatement: (data.positioningStatement as string) || `${data.productName}: ${data.oneLiner}`,
    icpDefinition: {
      definition: data.icpDefinition,
      decisionMaker: data.decisionMaker || '',
      primaryUseCase: data.primaryUseCase || '',
      jobsToBeDone: data.jobsToBeDone || '',
    },
    messagingPillars: pillars,
    competitiveLandscape: competitors.length > 0 ? competitors : null,
    customerLanguage: data.customerLanguage
      ? { verbatims: (data.customerLanguage as string).split('\n').filter(Boolean) }
      : null,
    brandVoice: null,
    wordsToUse,
    wordsToAvoid,
    updatedBy: auth.id,
    updateSource: 'manual',
    changeSummary: 'Initial context created during onboarding',
  });

  // Create default campaign
  await prisma.campaign.create({
    data: {
      name: DEFAULT_CAMPAIGN_NAME,
      description: 'Default campaign for sessions and artifacts not yet assigned to a campaign.',
      status: 'active',
      priority: 'low',
    },
  });

  // Send team invites directly via Supabase admin API (not via HTTP self-call)
  if (data.teamEmails) {
    const emails = (data.teamEmails as string)
      .split('\n')
      .map((e: string) => e.trim())
      .filter((e: string) => e && e.includes('@'));

    if (emails.length > 0) {
      const adminClient = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

      for (const email of emails) {
        try {
          await adminClient.auth.admin.inviteUserByEmail(email, {
            redirectTo: `${appUrl}/invite`,
            data: { role: 'member' },
          });
        } catch {
          // Non-blocking — invites can fail without stopping onboarding
        }
      }
    }
  }

  // Set onboarding complete cookie
  const response = NextResponse.json({ success: true });
  response.cookies.set('quiver_onboarded', 'true', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    httpOnly: true,
    sameSite: 'lax',
  });

  return response;
}
