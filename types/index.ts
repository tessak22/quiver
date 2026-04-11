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
