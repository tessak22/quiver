import Link from 'next/link';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

const SECTIONS = [
  { id: 'getting-started', label: 'Getting started' },
  { id: 'session-modes', label: 'Session modes' },
  { id: 'marketing-context', label: 'Marketing context' },
  { id: 'artifact-library', label: 'Artifact library' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'content', label: 'Content' },
  { id: 'customer-research', label: 'Customer research' },
  { id: 'performance-log', label: 'Performance log' },
  { id: 'mcp-server', label: 'MCP server' },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-md border bg-muted/50 p-4 text-xs leading-6">
      <code>{children}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Quiver Docs</h1>
        <p className="text-sm text-muted-foreground">
          Practical product guide for marketers using Quiver day-to-day.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-semibold">On this page</p>
            <nav className="mt-3 space-y-1">
              {SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {section.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="rounded-lg border bg-card p-4 text-xs text-muted-foreground">
            Tip: use this page as an onboarding checklist for new teammates.
          </div>
        </aside>

        <div className="space-y-10">
          <section id="getting-started" className="scroll-mt-20 space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">Getting started</h2>
            <p className="text-sm text-muted-foreground">
              Quiver is a marketing command center where AI work is grounded in your product context, not generic advice. As you log outcomes, the system improves future recommendations automatically.
            </p>
            <p className="text-sm text-muted-foreground">
              Core loop: update context - run sessions - save artifacts/content - log performance - review proposals - repeat.
            </p>
            <p className="text-sm">
              If your context is not set up yet, start in{' '}
              <Link href="/setup" className="underline underline-offset-4">
                onboarding
              </Link>
              .
            </p>
          </section>

          <section id="session-modes" className="scroll-mt-20 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">Session modes</h2>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Strategy</h3>
              <p className="text-sm text-muted-foreground">
                Use Strategy for positioning work, GTM planning, ICP development, and message architecture. It loads product-marketing-context, marketing-psychology, marketing-ideas, launch-strategy, and competitor-alternatives, then grounds recommendations in your active context and recent learning.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Create</h3>
              <p className="text-sm text-muted-foreground">
                Use Create when you need production-ready marketing assets. You choose artifact type and Quiver loads the matching skill set automatically, while surfacing related past work and performance signals so output quality reflects what already worked for your team.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Feedback</h3>
              <p className="text-sm text-muted-foreground">
                Use Feedback to paste call notes, qualitative reactions, or metrics and get structured synthesis. This mode loads customer-research and is best for turning raw evidence into actions and context update proposals.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Analyze</h3>
              <p className="text-sm text-muted-foreground">
                Use Analyze for performance interpretation and trend reading. It loads analytics-tracking and ab-test-setup, and works well when you need clear interpretation of campaign or channel metrics instead of copywriting output.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-semibold">Optimize</h3>
              <p className="text-sm text-muted-foreground">
                Use Optimize for CRO, copy critique, and A/B design. It loads page-cro, copy-editing, ab-test-setup, signup-flow-cro, and onboarding-cro to critique existing work against your actual context and ICP, then produce improved versions.
              </p>
            </div>
          </section>

          <section id="marketing-context" className="scroll-mt-20 space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">Marketing context</h2>
            <p className="text-sm text-muted-foreground">
              Your context document is the operating system for Quiver. It stores positioning, ICP, messaging pillars, customer language, proof points, active hypotheses, and brand voice.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>Use direct edits when you already know what should change.</li>
              <li>Use proposal review when updates are AI-suggested from feedback or performance logs.</li>
              <li>Every update creates a new version, so you can inspect history and restore older versions.</li>
              <li>The active version is injected into every session automatically.</li>
            </ul>
          </section>

          <section id="artifact-library" className="scroll-mt-20 space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">Artifact library</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>Status workflow: Draft - Review - Approved - Live - Archived.</li>
              <li>When an artifact moves to Live, Quiver creates a close-the-loop reminder for later result logging.</li>
              <li>Artifacts are versioned; revisions keep historical lineage via parent/child versions.</li>
              <li>Artifacts are linked to campaigns for roll-up reporting and context for later sessions.</li>
            </ul>
          </section>

          <section id="campaigns" className="scroll-mt-20 space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">Campaigns</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>Campaigns group sessions, artifacts, content, and performance entries into one initiative.</li>
              <li>Session and artifact workflows are designed to attach work to campaign scope (`Unassigned` when not specified).</li>
              <li>Campaign performance summaries aggregate linked performance logs for quick evaluation.</li>
              <li>Use campaign status and priority to separate planning from active execution.</li>
            </ul>
          </section>

          <section id="content" className="scroll-mt-20 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">Content</h2>
            <p className="text-sm text-muted-foreground">
              Content in Quiver is a markdown-native store with SEO/OG fields, distribution tracking, repurposing links, and time-series metric snapshots.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>Library views: All, Calendar, Drafts.</li>
              <li>Repurposing links derived content back to source content.</li>
              <li>Metric snapshots track compounding performance over time.</li>
            </ul>

            <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
              <p className="text-sm font-semibold">Public API callout</p>
              <p className="mt-2 text-sm">
                Your published content is available at <code>{APP_URL}/api/public/content/[slug]</code>. This returns markdown body, SEO fields, and OG metadata as JSON. Your website can call it at build time or runtime, so Quiver remains the source of truth.
              </p>
              <CodeBlock>{`GET ${APP_URL}/api/public/content/[slug]
GET ${APP_URL}/api/public/content`}</CodeBlock>
            </div>

            <p className="text-sm text-muted-foreground">
              Tabstack URL import is specified in Issue #50 and is planned, but not implemented in this checkout.
            </p>
          </section>

          <section id="customer-research" className="scroll-mt-20 space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">Customer research</h2>
            <p className="text-sm text-muted-foreground">
              Research entries support sources such as calls, interviews, surveys, reviews, forums, support tickets, social posts, and Common Room exports.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>After save, AI processing runs asynchronously: summary, themes, sentiment, hypothesis signals, extracted quotes, and context proposals.</li>
              <li>VoC quote library supports starring quotes; featured quotes are injected into Create and Strategy prompts.</li>
              <li>Hypothesis tracking shows whether evidence validates, challenges, or is neutral to active hypotheses.</li>
              <li>Push to Linear is a clipboard payload flow (UI and MCP), not a direct Linear API write from Quiver.</li>
            </ul>
          </section>

          <section id="performance-log" className="scroll-mt-20 space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">Performance log</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm">
              <li>Log outcomes manually in UI or programmatically through MCP tools.</li>
              <li>AI synthesis summarizes what worked and what did not after logging.</li>
              <li>Context update proposals can be reviewed and actioned (`pending`, `approved`, `rejected`).</li>
              <li>Dashboard close-the-loop queue highlights work awaiting result logging.</li>
            </ul>
          </section>

          <section id="mcp-server" className="scroll-mt-20 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">MCP server</h2>
            <p className="text-sm text-muted-foreground">
              The Quiver MCP server lets Claude Desktop, Cursor, or other MCP clients read and write Quiver data directly without using the browser.
            </p>
            <p className="text-sm text-muted-foreground">
              Why this matters: your external AI environment can combine Quiver tools with broader context, memory, and other connected systems, while Quiver remains the structured source of record.
            </p>

            <div>
              <h3 className="text-lg font-semibold">Build instructions</h3>
              <CodeBlock>{`cd mcp
npm install
npm run build`}</CodeBlock>
            </div>

            <div>
              <h3 className="text-lg font-semibold">Claude Desktop config</h3>
              <CodeBlock>{`{
  "mcpServers": {
    "quiver": {
      "command": "node",
      "args": ["/absolute/path/to/quiver/mcp/dist/index.js"],
      "env": { "DATABASE_URL": "your-supabase-connection-string" }
    }
  }
}`}</CodeBlock>
            </div>

            <div>
              <h3 className="text-lg font-semibold">Example workflows</h3>
              <ul className="list-disc space-y-2 pl-5 text-sm">
                <li>&quot;Pull last week&apos;s signups and log them to a campaign in Quiver.&quot;</li>
                <li>&quot;Save this draft as a content piece and track distribution.&quot;</li>
                <li>&quot;Log this customer call as research and generate a Linear payload.&quot;</li>
                <li>&quot;Show close-the-loop queue and pending context proposals.&quot;</li>
                <li>&quot;Propose positioning updates based on this week&apos;s evidence.&quot;</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold">Full tool list</h3>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium">Context:</span> <code>get_context</code>, <code>get_context_history</code>, <code>propose_context_update</code>, <code>apply_context_update</code>, <code>restore_context_version</code></p>
                <p><span className="font-medium">Campaigns:</span> <code>list_campaigns</code>, <code>get_campaign</code>, <code>create_campaign</code>, <code>update_campaign</code>, <code>update_campaign_status</code></p>
                <p><span className="font-medium">Artifacts:</span> <code>list_artifacts</code>, <code>get_artifact</code>, <code>save_artifact</code>, <code>update_artifact</code>, <code>update_artifact_status</code></p>
                <p><span className="font-medium">Performance:</span> <code>log_performance</code>, <code>get_performance_log</code>, <code>get_close_the_loop_queue</code>, <code>list_proposals</code>, <code>action_proposal</code></p>
                <p><span className="font-medium">Content:</span> <code>list_content</code>, <code>get_content</code>, <code>save_content</code>, <code>update_content</code>, <code>add_distribution</code>, <code>log_content_metrics</code>, <code>get_content_metrics</code>, <code>get_content_calendar</code></p>
                <p><span className="font-medium">Research:</span> <code>list_research_entries</code>, <code>get_research_entry</code>, <code>save_research_entry</code>, <code>list_quotes</code>, <code>get_linear_payload</code></p>
                <p><span className="font-medium">Sessions:</span> <code>list_sessions</code>, <code>get_session</code></p>
                <p><span className="font-medium">Workspace:</span> <code>get_dashboard_summary</code></p>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <h3 className="text-lg font-semibold">Propose vs apply</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Use <code>propose_context_update</code> for suggested changes that need human review. Use <code>apply_context_update</code> only when the human explicitly asks for immediate context mutation.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
