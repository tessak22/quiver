/**
 * Quiver — Shared Type Definitions
 *
 * Central type exports for the application.
 * All shared types should be defined or re-exported from here.
 */

// Session modes — the five AI session types
export type SessionMode = 'strategy' | 'create' | 'feedback' | 'analyze' | 'optimize';

// Artifact types — all supported output types
export type ArtifactType =
  | 'copywriting'
  | 'email_sequence'
  | 'cold_email'
  | 'social_content'
  | 'launch_strategy'
  | 'content_strategy'
  | 'positioning'
  | 'messaging'
  | 'ad_creative'
  | 'competitor_analysis'
  | 'seo'
  | 'cro'
  | 'ab_test'
  | 'landing_page'
  | 'one_pager'
  | 'other';

// Runtime-usable whitelist of all valid artifact types (mirrors ArtifactType union above)
export const ARTIFACT_TYPES: ArtifactType[] = [
  'copywriting', 'email_sequence', 'cold_email', 'social_content',
  'launch_strategy', 'content_strategy', 'positioning', 'messaging',
  'ad_creative', 'competitor_analysis', 'seo', 'cro', 'ab_test',
  'landing_page', 'one_pager', 'other',
];

// Artifact status workflow: Draft → Review → Approved → Live → Archived
export type ArtifactStatus = 'draft' | 'review' | 'approved' | 'live' | 'archived';

// Campaign status
export type CampaignStatus = 'planning' | 'active' | 'paused' | 'complete' | 'archived';

// Campaign priority
export type CampaignPriority = 'high' | 'medium' | 'low';

// Performance log entry types
export const PERFORMANCE_LOG_TYPE_VALUES = [
  'artifact',
  'campaign',
  'channel',
  'audience_segment',
  'context_proposal',
] as const;
export type PerformanceLogType = typeof PERFORMANCE_LOG_TYPE_VALUES[number];
export const PERFORMANCE_LOG_TYPES: PerformanceLogType[] = [...PERFORMANCE_LOG_TYPE_VALUES];

// Context update proposal status (used as Prisma enum values)
export type ContextUpdateStatus = 'pending' | 'approved' | 'rejected' | 'na';

// Team member roles
export type TeamRole = 'admin' | 'member' | 'viewer';

// Runtime-safe const arrays for validation in API routes
export const TEAM_ROLES: TeamRole[] = ['admin', 'member', 'viewer'];
export const SESSION_MODES: SessionMode[] = ['strategy', 'create', 'feedback', 'analyze', 'optimize'];
export const CAMPAIGN_STATUSES: CampaignStatus[] = ['planning', 'active', 'paused', 'complete', 'archived'];
export const CAMPAIGN_PRIORITIES: CampaignPriority[] = ['high', 'medium', 'low'];
export const ARTIFACT_STATUSES: ArtifactStatus[] = ['draft', 'review', 'approved', 'live', 'archived'];

function isValueOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

export function isPerformanceLogType(value: unknown): value is PerformanceLogType {
  return isValueOf(value, PERFORMANCE_LOG_TYPE_VALUES);
}

// Magic-string constants
export const DEFAULT_CAMPAIGN_NAME = 'Unassigned';
export const REMINDER_PREFIX = 'Reminder: Log results for';

// Chat message structure stored in session.messages JSON
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Artifact ready marker parsed from AI output
export interface ArtifactReadyMarker {
  type: ArtifactType;
  suggestedTitle: string;
}

// Context update proposal structure stored in performance_logs.proposedContextUpdates
export interface ContextUpdateProposal {
  field: string;
  current: string;
  proposed: string;
  rationale: string;
}

// Performance signal for UI display
export type PerformanceSignal = 'no_data' | 'logging' | 'strong' | 'weak';

// --- Issue #47: Customer Research Types ---

export type ResearchSourceType =
  | 'call' | 'interview' | 'survey' | 'review'
  | 'forum' | 'support_ticket' | 'social' | 'common_room' | 'other';

export type ContactStage = 'prospect' | 'customer' | 'churned' | 'never_converted';

export type HypothesisSignal = 'validates' | 'challenges' | 'neutral';

export type ResearchSentiment = 'positive' | 'negative' | 'neutral' | 'mixed';

export const RESEARCH_THEMES = [
  'pricing', 'onboarding', 'competitor_mention', 'feature_gap',
  'messaging', 'icp_fit', 'other'
] as const;
export type ResearchTheme = typeof RESEARCH_THEMES[number];

export const RESEARCH_SOURCE_LABELS: Record<ResearchSourceType, string> = {
  call: 'Call',
  interview: 'Interview',
  survey: 'Survey',
  review: 'Review',
  forum: 'Forum',
  support_ticket: 'Support ticket',
  social: 'Social',
  common_room: 'Common Room',
  other: 'Other',
};

export const CONTACT_STAGES: ContactStage[] = ['prospect', 'customer', 'churned', 'never_converted'];

export const CONTACT_STAGE_LABELS: Record<ContactStage, string> = {
  prospect: 'Prospect',
  customer: 'Customer',
  churned: 'Churned',
  never_converted: 'Never converted',
};

// --- Issue #49: Content Layer Types ---

export const CONTENT_TYPE_VALUES = [
  'blog_post',
  'case_study',
  'landing_page',
  'changelog',
  'newsletter',
  'social_thread',
  'video_script',
  'doc',
  'other',
] as const;
export type ContentType = typeof CONTENT_TYPE_VALUES[number];
export const CONTENT_TYPES: ContentType[] = [...CONTENT_TYPE_VALUES];

export const CONTENT_STATUS_VALUES = [
  'draft',
  'review',
  'approved',
  'published',
  'archived',
] as const;
export type ContentStatus = typeof CONTENT_STATUS_VALUES[number];
export const CONTENT_STATUSES: ContentStatus[] = [...CONTENT_STATUS_VALUES];

export const DISTRIBUTION_CHANNEL_VALUES = [
  'website',
  'dev_to',
  'hashnode',
  'medium',
  'newsletter',
  'linkedin',
  'twitter',
  'youtube',
  'other',
] as const;
export type DistributionChannel = typeof DISTRIBUTION_CHANNEL_VALUES[number];
export const DISTRIBUTION_CHANNELS: DistributionChannel[] = [...DISTRIBUTION_CHANNEL_VALUES];

export const DISTRIBUTION_STATUS_VALUES = ['planned', 'published', 'archived'] as const;
export type DistributionStatus = typeof DISTRIBUTION_STATUS_VALUES[number];
export const DISTRIBUTION_STATUSES: DistributionStatus[] = [...DISTRIBUTION_STATUS_VALUES];

export const CONTENT_METRIC_SOURCE_VALUES = [
  'manual',
  'mcp_pull',
  'scheduled_sync',
] as const;
export type ContentMetricSource = typeof CONTENT_METRIC_SOURCE_VALUES[number];
export const CONTENT_METRIC_SOURCES: ContentMetricSource[] = [...CONTENT_METRIC_SOURCE_VALUES];

export const CONTEXT_UPDATE_SOURCE_VALUES = ['manual', 'ai_proposed'] as const;
export type ContextUpdateSource = typeof CONTEXT_UPDATE_SOURCE_VALUES[number];
export const CONTEXT_UPDATE_SOURCES: ContextUpdateSource[] = [...CONTEXT_UPDATE_SOURCE_VALUES];

export function isContentType(value: unknown): value is ContentType {
  return isValueOf(value, CONTENT_TYPE_VALUES);
}

export function isContentStatus(value: unknown): value is ContentStatus {
  return isValueOf(value, CONTENT_STATUS_VALUES);
}

export function isDistributionChannel(value: unknown): value is DistributionChannel {
  return isValueOf(value, DISTRIBUTION_CHANNEL_VALUES);
}

export function isDistributionStatus(value: unknown): value is DistributionStatus {
  return isValueOf(value, DISTRIBUTION_STATUS_VALUES);
}

export function isContentMetricSource(value: unknown): value is ContentMetricSource {
  return isValueOf(value, CONTENT_METRIC_SOURCE_VALUES);
}

export function isContextUpdateSource(value: unknown): value is ContextUpdateSource {
  return isValueOf(value, CONTEXT_UPDATE_SOURCE_VALUES);
}

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  blog_post: 'Blog post',
  case_study: 'Case study',
  landing_page: 'Landing page',
  changelog: 'Changelog',
  newsletter: 'Newsletter',
  social_thread: 'Social thread',
  video_script: 'Video script',
  doc: 'Doc',
  other: 'Other',
};

export const DISTRIBUTION_CHANNEL_LABELS: Record<DistributionChannel, string> = {
  website: 'Website',
  dev_to: 'Dev.to',
  hashnode: 'Hashnode',
  medium: 'Medium',
  newsletter: 'Newsletter',
  linkedin: 'LinkedIn',
  twitter: 'Twitter',
  youtube: 'YouTube',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Issue #41: Bulk artifact operations
// ---------------------------------------------------------------------------

export type BulkAction =
  | 'status_change'
  | 'campaign_reassign'
  | 'add_tags'
  | 'remove_tags'
  | 'archive';

export interface BulkOperationResult {
  succeeded: string[];
  failed: Array<{ id: string; reason: string }>;
  skipped: Array<{ id: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Issue #38: Notifications
// ---------------------------------------------------------------------------

export type NotificationType = 'pattern_report' | 'context_proposal' | 'artifact_live';

export const NOTIFICATION_TYPES: NotificationType[] = [
  'pattern_report',
  'context_proposal',
  'artifact_live',
];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  pattern_report: 'Monthly Pattern Reports',
  context_proposal: 'Context Update Proposals',
  artifact_live: 'Artifact Live Reminders',
};

export interface NotificationPrefs {
  pattern_report?: boolean;
  context_proposal?: boolean;
  artifact_live?: boolean;
}
