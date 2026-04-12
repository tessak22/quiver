import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createContextVersion } from '@/lib/db/context';
import { DEFAULT_CAMPAIGN_NAME } from '@/types';
import { createClient } from '@/lib/supabase/server';
import { inviteTeamMemberByEmail } from '@/lib/invites';

const onboardingSchema = z.object({
  productName: z.string().trim().min(1),
  oneLiner: z.string().trim().min(1),
  icpDefinition: z.string().trim().min(1),
  coreProblem: z.string().trim().min(1),
  valuePillars: z.string().trim().min(1),
  positioningStatement: z.string().optional(),
  decisionMaker: z.string().optional(),
  primaryUseCase: z.string().optional(),
  jobsToBeDone: z.string().optional(),
  customerLanguage: z.string().optional(),
  wordsToUse: z.string().optional(),
  wordsToAvoid: z.string().optional(),
  teamEmails: z.string().optional(),
  competitors: z
    .array(
      z.object({
        name: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .optional(),
});

export interface NormalizedOnboardingInput {
  productName: string;
  oneLiner: string;
  positioningStatement: string;
  icpDefinition: {
    definition: string;
    decisionMaker: string;
    primaryUseCase: string;
    jobsToBeDone: string;
  };
  messagingPillars: Array<{ pillar: string }>;
  competitiveLandscape: Array<{ name: string; notes: string }> | null;
  customerLanguage: { verbatims: string[] } | null;
  wordsToUse: string[];
  wordsToAvoid: string[];
  inviteEmails: string[];
}

export interface OnboardingInviteFailure {
  email: string;
  error: string;
}

function splitLines(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseOnboardingInput(
  value: Record<string, unknown>
): NormalizedOnboardingInput {
  const parsed = onboardingSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      'Required fields missing: product name, one-liner, ICP, core problem, value pillars'
    );
  }

  const data = parsed.data;
  const competitors = (data.competitors ?? [])
    .map((entry) => ({
      name: (entry.name ?? '').trim(),
      notes: (entry.notes ?? '').trim(),
    }))
    .filter((entry) => entry.name.length > 0);

  const inviteEmails = splitLines(data.teamEmails).filter((email) =>
    email.includes('@')
  );

  return {
    productName: data.productName,
    oneLiner: data.oneLiner,
    positioningStatement:
      data.positioningStatement?.trim() || `${data.productName}: ${data.oneLiner}`,
    icpDefinition: {
      definition: data.icpDefinition,
      decisionMaker: data.decisionMaker?.trim() ?? '',
      primaryUseCase: data.primaryUseCase?.trim() ?? '',
      jobsToBeDone: data.jobsToBeDone?.trim() ?? '',
    },
    messagingPillars: splitLines(data.valuePillars).map((pillar) => ({ pillar })),
    competitiveLandscape: competitors.length > 0 ? competitors : null,
    customerLanguage: data.customerLanguage
      ? { verbatims: splitLines(data.customerLanguage) }
      : null,
    wordsToUse: splitLines(data.wordsToUse),
    wordsToAvoid: splitLines(data.wordsToAvoid),
    inviteEmails,
  };
}

export async function assertOnboardingNotCompleted(): Promise<void> {
  const existingContext = await prisma.contextVersion.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  if (existingContext) {
    throw new Error(
      'Onboarding already completed. Use the context editor to make changes.'
    );
  }
}

export async function ensureAdminTeamMember(
  authUserId: string,
  authEmail: string
): Promise<void> {
  const existingMember = await prisma.teamMember.findUnique({
    where: { id: authUserId },
  });

  if (existingMember) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await prisma.teamMember.create({
    data: {
      id: authUserId,
      name: user?.user_metadata?.name || authEmail.split('@')[0] || 'Admin',
      email: authEmail,
      role: 'admin',
    },
  });
}

export async function initializeWorkspace(
  normalized: NormalizedOnboardingInput,
  authUserId: string
): Promise<void> {
  await createContextVersion({
    positioningStatement: normalized.positioningStatement,
    icpDefinition: normalized.icpDefinition,
    messagingPillars: normalized.messagingPillars,
    competitiveLandscape: normalized.competitiveLandscape,
    customerLanguage: normalized.customerLanguage,
    brandVoice: null,
    wordsToUse: normalized.wordsToUse,
    wordsToAvoid: normalized.wordsToAvoid,
    updatedBy: authUserId,
    updateSource: 'manual',
    changeSummary: 'Initial context created during onboarding',
  });

  await prisma.campaign.create({
    data: {
      name: DEFAULT_CAMPAIGN_NAME,
      description:
        'Default campaign for sessions and artifacts not yet assigned to a campaign.',
      status: 'active',
      priority: 'low',
    },
  });
}

export async function sendOnboardingInvites(
  emails: string[]
): Promise<OnboardingInviteFailure[]> {
  const failures: OnboardingInviteFailure[] = [];

  for (const email of emails) {
    const invite = await inviteTeamMemberByEmail(email, 'member');
    if (!invite.success) {
      failures.push({
        email,
        error: invite.error ?? `Failed to invite ${email}`,
      });
    }
  }

  return failures;
}
