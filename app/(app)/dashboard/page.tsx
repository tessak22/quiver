import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type {
  SessionMode,
  ArtifactType,
  ArtifactStatus,
} from '@/types';
import { loadDashboardData } from '@/lib/db/dashboard';
import { getLatestPatternReport } from '@/lib/db/artifacts';

// ---------------------------------------------------------------------------
// Types — mirror API response shapes
// ---------------------------------------------------------------------------

interface CampaignRecord {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  updatedAt: Date | string;
  _count: {
    sessions: number;
    artifacts: number;
    performanceLogs: number;
  };
}

interface SessionRecord {
  id: string;
  title: string | null;
  mode: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  campaign: { id: string; name: string } | null;
}

interface ArtifactRecord {
  id: string;
  title: string;
  type: string;
  status: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  campaign: { id: string; name: string } | null;
}

interface ReminderRecord {
  id: string;
  qualitativeNotes: string | null;
  recordedAt: Date | string;
  artifact: {
    id: string;
    title: string;
    type: string;
    status: string;
  } | null;
  campaign: { id: string; name: string } | null;
}

interface ContextRecord {
  id: string;
  version: number;
  createdAt: Date | string;
}

interface PatternReportRecord {
  id: string;
  title: string;
  content: string;
  createdAt: Date | string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_MODES: SessionMode[] = [
  'strategy',
  'create',
  'feedback',
  'analyze',
  'optimize',
];

const MODE_COLORS: Record<SessionMode, string> = {
  strategy: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  create: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  feedback:
    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  analyze:
    'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  optimize: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
};

const MODE_LABELS: Record<SessionMode, string> = {
  strategy: 'Strategy',
  create: 'Create',
  feedback: 'Feedback',
  analyze: 'Analyze',
  optimize: 'Optimize',
};

const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  copywriting: 'Copywriting',
  email_sequence: 'Email Sequence',
  cold_email: 'Cold Email',
  social_content: 'Social Content',
  launch_strategy: 'Launch Strategy',
  content_strategy: 'Content Strategy',
  positioning: 'Positioning',
  messaging: 'Messaging',
  ad_creative: 'Ad Creative',
  competitor_analysis: 'Competitor Analysis',
  seo: 'SEO',
  cro: 'CRO',
  ab_test: 'A/B Test',
  landing_page: 'Landing Page',
  one_pager: 'One Pager',
  other: 'Other',
};

const STATUS_COLORS: Record<ArtifactStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  review:
    'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  approved:
    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  live: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_LABELS: Record<ArtifactStatus, string> = {
  draft: 'Draft',
  review: 'Review',
  approved: 'Approved',
  live: 'Live',
  archived: 'Archived',
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

function formatDate(dateValue: Date | string): string {
  return dateFormatter.format(new Date(dateValue));
}

function formatShortDate(dateValue: Date | string): string {
  return shortDateFormatter.format(new Date(dateValue));
}

// ---------------------------------------------------------------------------
// Dashboard state
// ---------------------------------------------------------------------------

interface DashboardData {
  campaigns: CampaignRecord[];
  sessions: SessionRecord[];
  artifacts: ArtifactRecord[];
  reminders: ReminderRecord[];
  context: ContextRecord | null;
  pendingProposals: number;
  loadIssues: string[];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function QuickStartBlock() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Quick Start</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Link href="/sessions/new">
          <Button size="lg" className="w-full">
            New Session
          </Button>
        </Link>
        <div className="flex flex-wrap gap-2">
          {SESSION_MODES.map((mode) => (
            <Link key={mode} href={`/sessions/new-chat?mode=${mode}`}>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold cursor-pointer transition-opacity hover:opacity-80 ${MODE_COLORS[mode]}`}
              >
                {MODE_LABELS[mode]}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveCampaignsBlock({
  campaigns,
}: {
  campaigns: CampaignRecord[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Active Campaigns</CardTitle>
          <Link href="/campaigns">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 px-4 text-center">
            <p className="text-sm font-medium">No active campaigns</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Activate a campaign to see it here.
            </p>
            <Link href="/campaigns" className="mt-3">
              <Button variant="outline" size="sm">
                Go to campaigns
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="block"
              >
                <div className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-sm truncate">
                      {campaign.name}
                    </p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {campaign._count.artifacts} artifact
                      {campaign._count.artifacts !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {campaign.goal && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {campaign.goal}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Last activity {formatShortDate(campaign.updatedAt)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentSessionsBlock({
  sessions,
}: {
  sessions: SessionRecord[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Recent Sessions</CardTitle>
          <Link href="/sessions">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 px-4 text-center">
            <p className="text-sm font-medium">No sessions yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Start your first AI session to get going.
            </p>
            <Link href="/sessions/new" className="mt-3">
              <Button variant="outline" size="sm">
                New session
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const mode = session.mode as SessionMode;
              return (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${
                        MODE_COLORS[mode] ?? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {MODE_LABELS[mode] ?? mode}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {session.title || 'Untitled'}
                      </p>
                      {session.campaign && (
                        <p className="text-xs text-muted-foreground truncate">
                          {session.campaign.name}
                        </p>
                      )}
                    </div>
                  </div>
                  <Link href={`/sessions/${session.id}`}>
                    <Button variant="outline" size="sm">
                      Resume
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentArtifactsBlock({
  artifacts,
}: {
  artifacts: ArtifactRecord[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Recent Artifacts</CardTitle>
          <Link href="/artifacts">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {artifacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 px-4 text-center">
            <p className="text-sm font-medium">No artifacts yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Save outputs from your AI sessions as artifacts.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {artifacts.map((artifact) => {
              const artType = artifact.type as ArtifactType;
              const artStatus = artifact.status as ArtifactStatus;
              return (
                <Link
                  key={artifact.id}
                  href={`/artifacts/${artifact.id}`}
                  className="block"
                >
                  <div className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {ARTIFACT_TYPE_LABELS[artType] ?? artType}
                      </Badge>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_COLORS[artStatus] ??
                          'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                        }`}
                      >
                        {STATUS_LABELS[artStatus] ?? artStatus}
                      </span>
                    </div>
                    <p className="text-sm font-medium mt-1.5 truncate">
                      {artifact.title}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CloseTheLoopBlock({
  reminders,
}: {
  reminders: ReminderRecord[];
}) {
  const now = new Date();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  function getUrgencyIndicator(recordedAt: Date | string): {
    className: string;
    label: string;
  } {
    const dueDate = new Date(recordedAt);
    if (dueDate < now) {
      return {
        className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        label: 'Overdue',
      };
    }
    if (dueDate < threeDaysFromNow) {
      return {
        className:
          'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
        label: 'Due soon',
      };
    }
    return {
      className:
        'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      label: formatShortDate(recordedAt),
    };
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Close the Loop</CardTitle>
          <Link href="/performance">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {reminders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 px-4 text-center">
            <p className="text-sm font-medium">All caught up</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No pending performance reminders.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((reminder) => {
              const urgency = getUrgencyIndicator(reminder.recordedAt);
              return (
                <Link
                  key={reminder.id}
                  href={`/performance${
                    reminder.artifact
                      ? `?artifactId=${reminder.artifact.id}`
                      : ''
                  }`}
                  className="block"
                >
                  <div className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {reminder.artifact?.title ?? 'Unknown artifact'}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${urgency.className}`}
                      >
                        {urgency.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-muted-foreground">
                        Due {formatShortDate(reminder.recordedAt)}
                      </p>
                      <span className="inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
                        Log Results
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContextStatusBlock({
  context,
  pendingProposals,
}: {
  context: ContextRecord | null;
  pendingProposals: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Context Status</CardTitle>
          <Link href="/context">
            <Button variant="ghost" size="sm">
              Manage
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {!context ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 px-4 text-center">
            <p className="text-sm font-medium">No context set up</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Set up your product marketing context to power AI sessions.
            </p>
            <Link href="/context" className="mt-3">
              <Button variant="outline" size="sm">
                Set up context
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Active version
              </span>
              <Badge variant="secondary">v{context.version}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Last updated
              </span>
              <span className="text-sm">{formatDate(context.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Pending proposals
              </span>
              {pendingProposals > 0 ? (
                <Link href="/context">
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900 dark:text-amber-200 dark:hover:bg-amber-800 cursor-pointer">
                    {pendingProposals} pending
                  </Badge>
                </Link>
              ) : (
                <span className="text-sm">None</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Strip common markdown syntax for safe plain-text preview rendering.
// Full markdown is available on the artifact detail page via marked+DOMPurify.
function stripMarkdownForPreview(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // headings
    .replace(/\*\*(.*?)\*\*/g, '$1')    // bold
    .replace(/\*(.*?)\*/g, '$1')        // italic
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, '')  // inline/code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^\s*[-*+]\s+/gm, '')      // unordered lists
    .replace(/^\s*\d+\.\s+/gm, '')      // ordered lists
    .replace(/\n{2,}/g, ' ')            // collapse blank lines
    .trim();
}

function MonthlyInsightsBlock({
  report,
}: {
  report: PatternReportRecord | null;
}) {
  if (!report) return null;

  const PREVIEW_LENGTH = 300;
  const stripped = stripMarkdownForPreview(report.content);
  const isTruncated = stripped.length > PREVIEW_LENGTH;
  const preview = isTruncated
    ? `${stripped.slice(0, PREVIEW_LENGTH)}...`
    : stripped;

  return (
    <Alert>
      <AlertTitle>Monthly Insights</AlertTitle>
      <AlertDescription>
        <span>{preview}</span>{' '}
        <Link
          href={`/artifacts/${report.id}`}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          View full report →
        </Link>
      </AlertDescription>
    </Alert>
  );
}

function DashboardLoadWarning({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
      Some dashboard data could not be loaded. Reload the page to try again.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function DashboardPageContent({
  data,
  patternReport,
}: {
  data: DashboardData;
  patternReport: PatternReportRecord | null;
}) {
  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your marketing command center.
        </p>
      </div>

      <DashboardLoadWarning issues={data.loadIssues} />

      {/* Monthly Insights — shown when a current-month pattern report exists */}
      <MonthlyInsightsBlock report={patternReport} />

      {/* Quick Start — full width */}
      <QuickStartBlock />

      {/* Grid: 2 columns on lg, stacked on small */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActiveCampaignsBlock campaigns={data.campaigns} />
        <RecentSessionsBlock sessions={data.sessions} />
        <RecentArtifactsBlock artifacts={data.artifacts} />
        <CloseTheLoopBlock reminders={data.reminders} />
      </div>

      {/* Context Status — full width */}
      <ContextStatusBlock
        context={data.context}
        pendingProposals={data.pendingProposals}
      />
    </div>
  );
}

export default async function DashboardPage() {
  try {
    const now = new Date();
    const [data, patternReport] = await Promise.all([
      loadDashboardData(),
      getLatestPatternReport(now.getFullYear(), now.getMonth()),
    ]);

    return <DashboardPageContent data={data} patternReport={patternReport} />;
  } catch (err) {
    console.error('[dashboard] Failed to render dashboard', { error: err });
    return (
      <div className="space-y-6 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your marketing command center.
          </p>
        </div>
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load dashboard data.
        </div>
        <Link href="/dashboard">
          <Button variant="outline">Reload dashboard</Button>
        </Link>
      </div>
    );
  }
}
