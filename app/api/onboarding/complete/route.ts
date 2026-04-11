import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/db';
import { createContextVersion } from '@/lib/db/context';
import { DEFAULT_CAMPAIGN_NAME } from '@/types';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

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
    ? data.wordsToUse.split('\n').map((w: string) => w.trim()).filter(Boolean)
    : [];
  const wordsToAvoid = data.wordsToAvoid
    ? data.wordsToAvoid.split('\n').map((w: string) => w.trim()).filter(Boolean)
    : [];

  // Parse competitors into structured JSON
  const competitors = (data.competitors || [])
    .filter((c: { name: string }) => c.name.trim())
    .map((c: { name: string; notes: string }) => ({
      name: c.name.trim(),
      notes: c.notes?.trim() || '',
    }));

  // Parse messaging pillars from freeform text
  const pillars = data.valuePillars
    .split('\n')
    .filter((line: string) => line.trim())
    .map((line: string) => ({ pillar: line.trim() }));

  // Create team member record for the admin
  const existingMember = await prisma.teamMember.findUnique({
    where: { id: user.id },
  });

  if (!existingMember) {
    await prisma.teamMember.create({
      data: {
        id: user.id,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'Admin',
        email: user.email!,
        role: 'admin',
      },
    });
  }

  // Create the first context version via the data layer
  await createContextVersion({
    positioningStatement: data.positioningStatement || `${data.productName}: ${data.oneLiner}`,
    icpDefinition: {
      definition: data.icpDefinition,
      decisionMaker: data.decisionMaker || '',
      primaryUseCase: data.primaryUseCase || '',
      jobsToBeDone: data.jobsToBeDone || '',
    },
    messagingPillars: pillars,
    competitiveLandscape: competitors.length > 0 ? competitors : null,
    customerLanguage: data.customerLanguage
      ? { verbatims: data.customerLanguage.split('\n').filter(Boolean) }
      : null,
    brandVoice: null,
    wordsToUse,
    wordsToAvoid,
    updatedBy: user.id,
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
    const emails = data.teamEmails
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
