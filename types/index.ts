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

// Artifact status workflow: Draft → Review → Approved → Live → Archived
export type ArtifactStatus = 'draft' | 'review' | 'approved' | 'live' | 'archived';

// Campaign status
export type CampaignStatus = 'planning' | 'active' | 'paused' | 'complete' | 'archived';

// Campaign priority
export type CampaignPriority = 'high' | 'medium' | 'low';

// Performance log entry types
export type PerformanceLogType = 'artifact' | 'campaign' | 'channel' | 'audience_segment';

// Context update sources
export type ContextUpdateSource = 'manual' | 'ai_proposed' | 'feedback_session';

// Context update proposal status
export type ContextUpdateStatus = 'pending' | 'approved' | 'rejected' | 'na';

// Team member roles
export type TeamRole = 'admin' | 'member' | 'viewer';

// Runtime-safe const arrays for validation in API routes
export const TEAM_ROLES: TeamRole[] = ['admin', 'member', 'viewer'];
export const SESSION_MODES: SessionMode[] = ['strategy', 'create', 'feedback', 'analyze', 'optimize'];
export const CAMPAIGN_STATUSES: CampaignStatus[] = ['planning', 'active', 'paused', 'complete', 'archived'];
export const CAMPAIGN_PRIORITIES: CampaignPriority[] = ['high', 'medium', 'low'];
export const ARTIFACT_STATUSES: ArtifactStatus[] = ['draft', 'review', 'approved', 'live', 'archived'];

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

export type ContentType = 'blog_post' | 'case_study' | 'landing_page' | 'changelog' | 'newsletter' | 'social_thread' | 'video_script' | 'doc' | 'other';
export type ContentStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';
export type DistributionChannel = 'website' | 'dev_to' | 'hashnode' | 'medium' | 'newsletter' | 'linkedin' | 'twitter' | 'youtube' | 'other';
export type MetricSnapshotSource = 'manual' | 'mcp_pull' | 'scheduled_sync';

export const CONTENT_TYPES: ContentType[] = ['blog_post', 'case_study', 'landing_page', 'changelog', 'newsletter', 'social_thread', 'video_script', 'doc', 'other'];
export const CONTENT_STATUSES: ContentStatus[] = ['draft', 'review', 'approved', 'published', 'archived'];
export const DISTRIBUTION_CHANNELS: DistributionChannel[] = ['website', 'dev_to', 'hashnode', 'medium', 'newsletter', 'linkedin', 'twitter', 'youtube', 'other'];

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
