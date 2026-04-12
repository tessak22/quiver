import { prisma } from '@/lib/db';

export async function getActiveContext() {
  return prisma.contextVersion.findFirst({
    where: { isActive: true },
  });
}

export async function getContextVersions() {
  return prisma.contextVersion.findMany({
    orderBy: { version: 'desc' },
  });
}

export async function createContextVersion(data: {
  positioningStatement?: string | null;
  icpDefinition?: unknown;
  messagingPillars?: unknown;
  competitiveLandscape?: unknown;
  customerLanguage?: unknown;
  proofPoints?: unknown;
  activeHypotheses?: unknown;
  brandVoice?: string | null;
  wordsToUse: string[];
  wordsToAvoid: string[];
  updatedBy: string;
  updateSource: string;
  changeSummary: string;
}) {
  // Get the latest version number
  const latest = await prisma.contextVersion.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const nextVersion = (latest?.version ?? 0) + 1;

  // Transaction: deactivate old, create new
  return prisma.$transaction(async (tx) => {
    await tx.contextVersion.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    return tx.contextVersion.create({
      data: {
        positioningStatement: data.positioningStatement,
        icpDefinition: data.icpDefinition ?? undefined,
        messagingPillars: data.messagingPillars ?? undefined,
        competitiveLandscape: data.competitiveLandscape ?? undefined,
        customerLanguage: data.customerLanguage ?? undefined,
        proofPoints: data.proofPoints ?? undefined,
        activeHypotheses: data.activeHypotheses ?? undefined,
        brandVoice: data.brandVoice,
        wordsToUse: data.wordsToUse,
        wordsToAvoid: data.wordsToAvoid,
        updatedBy: data.updatedBy,
        updateSource: data.updateSource,
        changeSummary: data.changeSummary,
        version: nextVersion,
        isActive: true,
      },
    });
  });
}

/**
 * Apply field-level updates to the active context version, creating a new version.
 * Reads the current active context, merges in the provided updates, and creates
 * a new version via createContextVersion().
 *
 * Used by: performance proposal approvals, AI-proposed context updates.
 */
export async function applyContextUpdates(
  updates: Record<string, unknown>,
  updatedBy: string,
  changeSummary: string
) {
  const activeContext = await getActiveContext();
  if (!activeContext) {
    throw new Error('No active context version found');
  }

  return createContextVersion({
    positioningStatement:
      (updates.positioningStatement as string | undefined) ??
      activeContext.positioningStatement,
    icpDefinition: updates.icpDefinition ?? activeContext.icpDefinition,
    messagingPillars:
      updates.messagingPillars ?? activeContext.messagingPillars,
    competitiveLandscape:
      updates.competitiveLandscape ?? activeContext.competitiveLandscape,
    customerLanguage:
      updates.customerLanguage ?? activeContext.customerLanguage,
    proofPoints: updates.proofPoints ?? activeContext.proofPoints,
    activeHypotheses:
      updates.activeHypotheses ?? activeContext.activeHypotheses,
    brandVoice:
      (updates.brandVoice as string | undefined) ?? activeContext.brandVoice,
    wordsToUse:
      (updates.wordsToUse as string[] | undefined) ?? activeContext.wordsToUse,
    wordsToAvoid:
      (updates.wordsToAvoid as string[] | undefined) ??
      activeContext.wordsToAvoid,
    updatedBy,
    updateSource: 'ai_proposed',
    changeSummary,
  });
}

export async function restoreContextVersion(id: string, restoredBy: string) {
  const source = await prisma.contextVersion.findUnique({ where: { id } });
  if (!source) throw new Error('Context version not found');

  return createContextVersion({
    positioningStatement: source.positioningStatement,
    icpDefinition: source.icpDefinition,
    messagingPillars: source.messagingPillars,
    competitiveLandscape: source.competitiveLandscape,
    customerLanguage: source.customerLanguage,
    proofPoints: source.proofPoints,
    activeHypotheses: source.activeHypotheses,
    brandVoice: source.brandVoice,
    wordsToUse: source.wordsToUse,
    wordsToAvoid: source.wordsToAvoid,
    updatedBy: restoredBy,
    updateSource: 'manual',
    changeSummary: `Restored from version ${source.version}`,
  });
}
