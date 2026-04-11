/**
 * Allowed context field names — shared by apply_context_update and action_proposal.
 * Must stay in sync with the ContextVersion Prisma model.
 */
export const CONTEXT_FIELDS = new Set([
  'positioningStatement',
  'icpDefinition',
  'messagingPillars',
  'competitiveLandscape',
  'customerLanguage',
  'proofPoints',
  'activeHypotheses',
  'brandVoice',
  'wordsToUse',
  'wordsToAvoid',
] as const);

export type ContextFieldName = typeof CONTEXT_FIELDS extends Set<infer T> ? T : never;
