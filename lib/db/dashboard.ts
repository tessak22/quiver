import { safeErrorMessage } from '@/lib/utils';
import { getCampaigns } from '@/lib/db/campaigns';
import { getSessions } from '@/lib/db/sessions';
import { getArtifacts, getReminders } from '@/lib/db/artifacts';
import { getActiveContext } from '@/lib/db/context';
import { getPendingProposals } from '@/lib/db/performance';

export interface DashboardData {
  campaigns: Awaited<ReturnType<typeof getCampaigns>>;
  sessions: Awaited<ReturnType<typeof getSessions>>;
  artifacts: Awaited<ReturnType<typeof getArtifacts>>;
  reminders: Awaited<ReturnType<typeof getReminders>>;
  context: Awaited<ReturnType<typeof getActiveContext>>;
  pendingProposals: number;
  loadIssues: string[];
}

async function loadWithFallback<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T,
  issues: string[]
): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    const message = safeErrorMessage(err, `Failed to load ${label}`);
    console.error(`[dashboard] ${message}`, err);
    issues.push(message);
    return fallback;
  }
}

export async function loadDashboardData(): Promise<DashboardData> {
  const loadIssues: string[] = [];

  const [campaigns, sessions, artifacts, reminders, context, proposals] =
    await Promise.all([
      loadWithFallback('campaigns', () => getCampaigns({ status: 'active' }), [], loadIssues),
      loadWithFallback('sessions', () => getSessions(), [], loadIssues),
      loadWithFallback('artifacts', () => getArtifacts({ status: 'active' }), [], loadIssues),
      loadWithFallback('reminders', () => getReminders(), [], loadIssues),
      loadWithFallback('context', () => getActiveContext(), null, loadIssues),
      loadWithFallback('pending proposals', () => getPendingProposals(), [], loadIssues),
    ]);

  return {
    campaigns: campaigns.slice(0, 5),
    sessions: sessions.slice(0, 5),
    artifacts: artifacts.slice(0, 5),
    reminders,
    context,
    pendingProposals: proposals.length,
    loadIssues,
  };
}
