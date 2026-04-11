# Quiver — Product Specification

**Version:** 1.0  
**License:** MIT  
**Repo:** github.com/tessak22/quiver  
**Deploy target:** Vercel  
**April 2026**

---

## What is Quiver?

Quiver is a self-hosted, open source, AI-powered marketing command center for product teams.

It is not a generic AI chat interface. It is a context machine: every session starts with a complete, structured understanding of your product's positioning, ICP, competitive landscape, past campaigns, and what has worked. The AI outputs are grounded in your actual history, not generic best practices.

Any product team can run Quiver. Deploy your own instance, complete the onboarding flow to define your product context, invite your teammates, and start working. Each deployment is a single workspace — shared context, shared campaigns, shared artifact library — accessible to everyone on the team.

The system compounds: every result you log makes the next session smarter. Over time, the product marketing context becomes a proprietary asset — your specific what-works record, encoded and searchable, informing every new piece of work automatically.

> **Core principle:** The grounding is the product. Generic AI ideas are cheap. Ideas grounded in your positioning, your ICP, your historical performance, and your competitive context are the actual value. Everything in this spec serves that principle.

---

## What Quiver is not

- A replacement for Notion, Linear, or your CRM — it is the AI work layer
- A generic AI marketing tool — all skill frameworks come from the [marketingskills repo](https://github.com/coreyhaines31/marketingskills), your product context makes them specific to you
- A solo tool — built for shared team access from day one
- A multi-tenant SaaS — each team deploys and owns their own instance

---

## Architecture overview

Four layers:

| Layer | What it is |
|---|---|
| **Context** | The living product marketing context. Structured fields, versioned, team-editable. Every AI session reads this first. |
| **Work** | AI sessions with explicit mode selection. Five modes, each loading the appropriate skill frameworks automatically. |
| **Artifacts** | Every output produced is saved to the artifact library. Tagged, versioned, linked to campaigns and performance. |
| **Track** | Campaign tracker and performance log. Results feed the learning loop back into context. |

---

## Tech stack

| Layer | Decision |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Database | Supabase (Postgres) |
| ORM | Prisma |
| Auth | Supabase Auth |
| AI | Anthropic SDK — `claude-sonnet-4-20250514` |
| Skills | Markdown files from `coreyhaines31/marketingskills`, pinned at a specific commit in `/skills` |
| Deployment | Vercel |
| Language | TypeScript strict mode throughout |

---

## Database schema

### `context_versions`
The living product marketing context. One `isActive: true` row at any time. All previous versions retained.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| version | integer | Auto-incremented |
| isActive | boolean | True for current version only |
| positioningStatement | text | Core positioning statement |
| icpDefinition | jsonb | Structured ICP: segments, stack rank, exclusions |
| messagingPillars | jsonb | Array of value/benefit/feature pillars |
| competitiveLandscape | jsonb | Competitor summaries with positioning notes |
| customerLanguage | jsonb | Verbatim phrases: how they describe the problem |
| proofPoints | jsonb | Validated claims, metrics, testimonials |
| activeHypotheses | jsonb | Marked with validation status |
| brandVoice | text | Tone, style, dos and don'ts |
| wordsToUse | text[] | Approved vocabulary |
| wordsToAvoid | text[] | Banned vocabulary |
| updatedBy | uuid FK | Team member who made the change |
| updateSource | text | `manual` \| `ai_proposed` \| `feedback_session` |
| changeSummary | text | What changed and why |
| createdAt | timestamptz | Auto-set |

### `campaigns`
Top-level initiative grouping. Every artifact and session links to a campaign.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| name | text | Campaign name. Required. |
| description | text | What this campaign is trying to achieve |
| goal | text | Primary measurable goal |
| channels | text[] | e.g. email, LinkedIn, content, ads |
| status | text | `planning` \| `active` \| `paused` \| `complete` \| `archived` |
| priority | text | `high` \| `medium` \| `low` |
| startDate | date | Optional |
| endDate | date | Optional |
| ownerId | uuid FK | Team member responsible |
| contextVersionId | uuid FK | Context version active when created |
| createdAt | timestamptz | Auto-set |
| updatedAt | timestamptz | Auto-updated |

### `sessions`
Every AI conversation. Stores full message history plus metadata.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| title | text | AI-generated after first exchange. Editable. |
| mode | text | `strategy` \| `create` \| `feedback` \| `analyze` \| `optimize` |
| skillsLoaded | text[] | Skill names injected into this session's system prompt |
| messages | jsonb | Full history: `[{role, content, timestamp}]`. Append-only. |
| campaignId | uuid FK | Optional. Campaign this session belongs to. |
| contextVersionId | uuid FK | Context version used in this session |
| createdBy | uuid FK | Team member who started the session |
| createdAt | timestamptz | Auto-set |
| updatedAt | timestamptz | Auto-updated on each message |
| isArchived | boolean | Soft delete |

### `artifacts`
Every piece of work produced in the app.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| title | text | Human-readable title. Required. |
| type | text | `copywriting` \| `email_sequence` \| `cold_email` \| `social_content` \| `launch_strategy` \| `content_strategy` \| `positioning` \| `messaging` \| `ad_creative` \| `competitor_analysis` \| `seo` \| `cro` \| `ab_test` \| `landing_page` \| `one_pager` \| `other` |
| content | text | Full output content. Markdown. |
| status | text | `draft` \| `review` \| `approved` \| `live` \| `archived` |
| skillUsed | text | Which skill framework was loaded |
| campaignId | uuid FK | Required |
| sessionId | uuid FK | Session that produced this artifact |
| contextVersionId | uuid FK | Context version when created |
| version | integer | Auto-incremented. Supports versioning. |
| parentArtifactId | uuid FK | Null for v1. Set for revised versions. |
| tags | text[] | Freeform |
| createdBy | uuid FK | Team member |
| createdAt | timestamptz | Auto-set |
| updatedAt | timestamptz | Auto-updated |

### `performance_logs`
Results per artifact and campaign. The raw material for the learning loop.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| artifactId | uuid FK | Nullable if campaign-level entry |
| campaignId | uuid FK | Required |
| logType | text | `artifact` \| `campaign` \| `channel` \| `audience_segment` |
| metrics | jsonb | Freeform key-value: `{opens, replies, clicks, conversions, ...}` |
| qualitativeNotes | text | What happened. Customer reactions. |
| whatWorked | text | Explicit summary for the learning loop |
| whatDidnt | text | Explicit summary for the learning loop |
| proposedContextUpdates | jsonb | `[{field, current, proposed, rationale}]` |
| contextUpdateStatus | text | `pending` \| `approved` \| `rejected` \| `na` |
| recordedBy | uuid FK | Team member |
| recordedAt | timestamptz | When results were logged |
| periodStart | date | Start of measurement window |
| periodEnd | date | End of measurement window |

### `team_members`
Extends Supabase Auth with GTM-specific fields.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Matches Supabase Auth user ID |
| name | text | Display name |
| email | text | Work email |
| role | text | `admin` \| `member` \| `viewer` |
| createdAt | timestamptz | Auto-set |

---

## Feature specifications

### 4.1 — Marketing context editor

The foundation. A structured editor for the product marketing context, version-controlled, team-editable.

| Feature | Description | Priority |
|---|---|---|
| Structured fields | Each section (positioning, ICP, messaging, competitors, etc.) is a distinct field with its own edit UI. Not a freeform text blob. | P0 |
| Version history | Every save creates a new version. Full history visible. One-click restore. Change summary required on each save. | P0 |
| Active/draft states | Draft edits before committing. Active version is what every AI session reads. | P0 |
| AI-proposed updates | After a feedback session, AI generates proposed context updates. Each proposal shows current vs proposed with rationale. Approve / reject / modify. | P0 |
| AI review mode | Before saving, AI reviews changes for internal consistency and flags potential mismatches. | P1 |
| Change log | Timeline of all context changes: what changed, who changed it, source, triggering session. | P1 |
| Context completeness score | Visual indicator of which sections are populated vs empty/hypothesis. | P1 |
| Export | Export current context version as Markdown or push to a connected Notion workspace. | P2 |

---

### 4.2 — AI session modes

Five explicit modes. Each loads a specific set of skill frameworks automatically. Mode is selected before the conversation starts.

#### Mode: Strategy
For positioning work, GTM planning, ICP development, messaging architecture, launch planning.

- **Skills loaded:** `vbf-messaging`, `marketing-psychology`, `marketing-ideas`, `launch-strategy`, `competitor-alternatives`
- Full marketing context injected as system prompt
- Competitive landscape summary included automatically
- AI outputs include: which framework informed the recommendation, what context was applied
- Strategic outputs are promptable as artifacts

#### Mode: Create
For writing and producing marketing assets. Declare artifact type at session start — skill loads automatically.

- **Skills loaded:** determined by artifact type (see skill routing table)
- Full context injected: positioning, ICP, messaging pillars, voice guidelines, words to avoid
- Historical artifact pull: similar past artifacts surfaced with performance data
- Every output has one-click "Save as artifact" with auto-populated metadata
- Revision sessions: load an existing artifact to continue refining it

#### Mode: Feedback
For ingesting results, customer reactions, call notes, and campaign data.

- **Skills loaded:** `customer-research`
- Paste in raw input: metrics, call transcripts, customer quotes, data exports
- AI synthesizes: what worked, what didn't, what surprised, what to do differently
- Generates proposed context updates — each proposal is a discrete reviewable item
- Links synthesized feedback to relevant artifacts and campaigns
- Creates a performance log entry automatically

#### Mode: Analyze
For data and performance work. Number crunching, trend analysis, channel comparisons.

- **Skills loaded:** `analytics-tracking`, `ab-test-setup`
- Paste in data or pull from performance log directly
- AI interprets against your context: what these numbers mean for your specific ICP
- Trend view: AI compares current period to prior periods from your performance log

#### Mode: Optimize
For CRO, copy review, A/B test design, and improving existing assets.

- **Skills loaded:** `page-cro`, `copy-editing`, `ab-test-setup`, `signup-flow-cro`, `onboarding-cro`
- Load an existing artifact or paste in content from outside the app
- AI critique uses your actual positioning and ICP — not generic CRO advice
- Produces: annotated critique + revised version as separate linked artifacts

#### Session features (all modes)

| Feature | Description | Priority |
|---|---|---|
| Persistent sessions | Saved, resumable, searchable by keyword/mode/campaign/date | P0 |
| Context injection | Active context version injected as system prompt. Collapsible panel in UI shows what AI is using. | P0 |
| Artifact save | Any AI output saveable as artifact. One click. Pre-populates title, type, campaign. | P0 |
| Campaign link | Sessions linkable to a campaign at start or mid-session | P0 |
| Session title | AI-generated after first exchange. Editable. | P0 |
| Skills panel | Shows which skill files were loaded. Expandable to full content. | P1 |
| Related artifacts | Sidebar shows existing artifacts in same campaign | P1 |
| AI output metadata | Each response tagged with: skill used, what context informed it | P1 |
| Share session | Read-only link for sharing outside the team | P2 |

---

### 4.3 — Artifact library

The complete record of everything produced.

| Feature | Description | Priority |
|---|---|---|
| Library view | Filterable by type, campaign, status, date, tag. Card layout with performance signal. | P0 |
| Artifact detail | Full content view. Metadata sidebar: type, campaign, session, context version, skill used, version history, performance log. | P0 |
| Status workflow | Draft → Review → Approved → Live → Archived. Changes logged with timestamp and team member. | P0 |
| Search | Full-text search across title and content. All filter dimensions. | P0 |
| Export | Markdown, plain text, or copy to clipboard | P0 |
| Performance signal | Library card shows: no data \| logging \| strong \| weak | P1 |
| Close the loop | When artifact moves to Live, reminder created: "Log results in 2 weeks." | P1 |
| Version history | Full version history per artifact. Diff view. | P1 |
| Duplicate | Clone artifact as new draft | P1 |
| Related artifacts | Artifacts in same campaign shown in sidebar | P1 |
| Bulk actions | Bulk status change, campaign reassign, tag | P2 |

---

### 4.4 — Campaign tracker

Lightweight campaign management.

| Feature | Description | Priority |
|---|---|---|
| Campaign list | Board/list toggle. Status columns: Planning, Active, Paused, Complete. Card shows name, goal, status, owner, artifact count, performance signal. | P0 |
| Campaign detail | Goal, channels, dates, owner, linked sessions (with mode badges), linked artifacts, performance log entries, performance summary. | P0 |
| Create campaign | Name, description, goal, channels, dates, owner. Quick create from dashboard. | P0 |
| Archive | Archived campaigns still searchable, still inform AI context. | P0 |
| Campaign brief AI assist | AI-assisted brief generator: input goal, get suggested channels and success metrics informed by past campaign performance. | P1 |
| Progress view | Timeline of sessions and artifacts within the campaign | P1 |
| Performance summary | Aggregated performance from all linked artifacts with AI narrative. | P1 |

---

### 4.5 — Performance log

The results layer. The raw material for the learning loop.

| Feature | Description | Priority |
|---|---|---|
| Log entry UI | Fast form: which artifact or campaign, metric fields (freeform key-value), qualitative notes, what worked, what didn't. | P0 |
| AI synthesis | After save, AI synthesizes: proposed context updates, patterns matching past entries, what this changes about recommendations. | P0 |
| Context update proposals | AI-generated proposed edits to context doc. Each proposal: field, current value, proposed value, rationale. Approve / reject / modify. | P0 |
| Log history | Timeline of all performance entries. Filterable by artifact, campaign, date, who logged it. | P0 |
| Reminder system | When artifact goes Live, auto-create "close the loop" reminder. Visible on dashboard queue. | P1 |
| Pattern report | Monthly AI-generated report: what's working, what isn't, what to shift. Displayed on dashboard. | P1 |
| Export | Performance log as CSV | P2 |

---

### 4.6 — Dashboard

The first screen. Designed for daily use.

| Feature | Description | Priority |
|---|---|---|
| Quick start | Prominent "New session" with mode selector. Campaign selector. | P0 |
| Active campaigns | Cards for all active campaigns. Status, last activity, pending reminders. | P0 |
| Recent sessions | Last 5 sessions with mode badge, title, campaign link. Resume button. | P0 |
| Recent artifacts | Last 5 artifacts with type badge and status. | P0 |
| Close the loop queue | Artifacts with pending result reminders. Overdue flagged. One-click to log entry. | P1 |
| Context status | Current context version. Last updated. Completeness score. Pending AI proposals count. | P1 |
| Pattern signal | Top 2–3 current insights from pattern report if available. | P1 |

---

### 4.7 — Team and settings

| Feature | Description | Priority |
|---|---|---|
| Team invites | Invite by email. Role selection: admin, member, viewer. | P0 |
| API key management | Anthropic API key set by admin. Stored in environment, not in DB. | P0 |
| Skills management | View pinned skills version. Admin can trigger manual update to latest. Shows last updated date per skill. | P1 |
| Notification preferences | Email or in-app: close-the-loop reminders, context update proposals, session shares. | P2 |
| Context backup | Manual export of full context history as JSON. Restore from backup. | P2 |

---

## Skill routing

### Phase 1: Explicit mode selection

User selects mode before starting a session. App loads the corresponding skills.

| Mode | Skills loaded | Additional context injected |
|---|---|---|
| strategy | `vbf-messaging`, `marketing-psychology`, `marketing-ideas`, `launch-strategy`, `competitor-alternatives` | Full context + competitive landscape + active campaigns |
| create | Determined by artifact type at session start | Full context + ICP stack rank + messaging pillars + voice guidelines + similar past artifacts with performance data |
| feedback | `customer-research` | Full context + past feedback entries + active hypotheses |
| analyze | `analytics-tracking`, `ab-test-setup` | Full context + performance log summary for relevant campaign |
| optimize | `page-cro`, `copy-editing`, `ab-test-setup`, `signup-flow-cro`, `onboarding-cro` | Full context + target artifact (if loaded) + performance history for artifact type |

**Artifact type → skill mapping (create mode):**

| Artifact type | Skill |
|---|---|
| copywriting | `copywriting` |
| email_sequence | `email-sequence` |
| cold_email | `cold-email` |
| social_content | `social-content` |
| ad_creative | `ad-creative` |
| landing_page | `copywriting` + `page-cro` |
| one_pager | `sales-enablement` |
| positioning | `vbf-messaging` |
| messaging | `vbf-messaging` |
| content_strategy | `content-strategy` |
| ab_test | `ab-test-setup` |
| all others | `copywriting` |

### Phase 2: Intent detection (future — not in initial build)

After 6–8 weeks of real usage, intent detection can be layered on. User describes what they want, app detects mode and artifact type, pre-selects for confirmation. Phase 1 mode selection remains available as permanent override. Explicitly out of scope for v1.

### System prompt assembly order

Every session system prompt is assembled in this exact order:

1. **Role definition** — "You are an expert B2B marketing strategist working inside Quiver for [product name]..."
2. **Product context** — Full active `context_version` row, formatted by section
3. **Skill frameworks** — Relevant SKILL.md files injected in full, each with a section header
4. **Performance history** — 5 most recent artifacts of same type with performance signals (create mode)
5. **Session mode instructions** — Mode-specific output format and behavior guidance
6. **Output format instructions** — `[ARTIFACT READY — type: {type} | suggested title: {title}]` marker instructions

---

## The three feedback loops

### Loop 1 — Manual feedback, automated synthesis (launch)

Team member pastes in results after something goes live. App does the synthesis work, proposes context updates, logs performance. Systematic improvement even with manual input.

- Input: metrics paste, call notes, customer quotes, data exports
- Output: synthesized summary, performance log entry, context update proposals
- Review step: team approves/rejects each proposed context change before it applies

### Loop 2 — Close the loop reminder system (launch)

Prevents the failure mode of launching something and never recording what happened.

- Trigger: artifact status changes to Live
- System creates a reminder: "Log results for [artifact] — due [2 weeks from live date]"
- Appears on dashboard close-the-loop queue
- Overdue reminders escalate visibility
- One-click from reminder to pre-populated log entry form

### Loop 3 — Pattern detection and monthly synthesis (Phase 2)

Once enough performance data exists (estimate: 3+ months of consistent logging).

- Scheduled monthly job: AI analyzes all performance log entries from past 30 days
- Output: pattern report artifact — what's working, what isn't, emerging signals
- Includes proposed updates to context doc based on consistent patterns
- All proposals reviewed and approved by team before context changes
- Displayed on dashboard as "Monthly insights" callout

---

## Onboarding flow

New deployments are gated behind a 6-step onboarding wizard on first run. Triggered when no active `context_version` row exists. All routes redirect to `/setup` until complete.

Each step uses AI-assisted input: user provides rough notes, AI structures and refines using the `product-marketing-context` skill framework.

| Step | Fields | AI assist |
|---|---|---|
| 1 — Product basics | Name, one-liner, product category, business model | Drafts a refined one-liner from rough input |
| 2 — Target audience | ICP definition, decision-maker, primary use case, jobs to be done | Structures freeform input into clean ICP definition |
| 3 — Positioning | Core problem, why alternatives fall short, key differentiators | Drafts a positioning statement from inputs |
| 4 — Messaging | Value pillars (freeform), customer language (paste verbatims), words to use/avoid | Structures into VBF messaging pillars |
| 5 — Competitive landscape | Up to 5 competitors with name + positioning notes. "We don't know much yet" is fine. | None — just structured input |
| 6 — Team setup | Confirm admin account, invite teammates by email (optional) | None |

Step progress is saved to localStorage so a browser refresh doesn't lose work. The step 6 submission creates the first `context_version` row marked `isActive: true` in a single transaction. App unlocks immediately after.

---

## Navigation and UX principles

### Primary navigation (six items)

- **Dashboard** — home, quick start, active campaigns, queues
- **Sessions** — all sessions, new session, resume
- **Artifacts** — library, search, filter
- **Campaigns** — board/list, campaign detail
- **Context** — editor, version history, proposed updates
- **Performance** — log entries, pattern report

### UX principles

- **Speed to session** — starting a new session takes under 5 seconds from any page
- **Context always visible** — persistent header element shows active context version. Collapsible panel in sessions shows exactly what the AI is working from.
- **Artifacts are first-class** — every AI output with value is saveable in one click. Save pre-populates everything it can infer.
- **Performance linked everywhere** — from an artifact, see its performance. From a campaign, see all artifact performance. No dead ends.
- **No orphans** — every session and artifact belongs to a campaign. If created without linking, default campaign is "Unassigned" — visible but clearly needs a home.
- **Team transparency** — all sessions, artifacts, and campaigns are visible to the whole team by default. No private work silos.

---

## Build order

Build in this sequence. Do not jump ahead. Each phase depends on the previous.

| Phase | Deliverable | Why this order |
|---|---|---|
| 1 | Database schema + Supabase setup | Foundation for everything. All 6 tables, RLS policies. No seed data — onboarding produces it. |
| 2 | Auth + team access | Supabase Auth. Login, invite flow, three roles. Must exist before any shared data. |
| 3 | Onboarding flow | 6-step wizard. Produces the first `context_version` row. App is gated until complete. |
| 4 | Context editor (P0) | Structured fields, version save, change log. Must exist before sessions can work. |
| 5 | AI sessions (all 5 modes) | Core product. Context injection, skill loading, streaming, session save/resume, artifact save. |
| 6 | Campaign tracker (P0) | Campaign CRUD, status, link sessions and artifacts. |
| 7 | Artifact library (P0) | Library view, detail, status workflow, search, export. Requires campaigns. |
| 8 | Performance log + feedback loop | Log entry, AI synthesis, context update proposals, close-the-loop reminders. Requires real artifacts. |
| 9 | Dashboard + P1 features | Dashboard queues, context status, recent activity. P1 features from each section. |
| 10 | Intent detection (Phase 2) | After 6–8 weeks of real usage. Explicit mode selection remains as permanent override. |

---

## Deploy story

### Self-hosted on Vercel (recommended)

```
1. Fork github.com/tessak22/quiver
2. Create a Supabase project — copy DATABASE_URL and keys
3. Create an Anthropic API key
4. Deploy to Vercel — connect forked repo, add env vars
5. Visit your deployment URL — onboarding wizard launches on first run
6. Complete onboarding, invite your team
```

### Environment variables

```env
# Database
DATABASE_URL=            # Postgres connection string (Supabase recommended)
DIRECT_URL=              # Direct connection URL for Prisma migrations

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=       # Your Anthropic API key — used for all AI sessions

# App
NEXTAUTH_SECRET=         # Random string for session encryption
NEXT_PUBLIC_APP_URL=     # Your deployment URL (e.g. https://quiver.yourteam.com)
```

Each team deploys their own isolated instance. There is no shared infrastructure between deployments. A second team forks the repo, deploys their own instance with their own Supabase project and Anthropic key, completes their own onboarding — their data never touches anyone else's.

---

## Out of scope

Intentionally excluded to keep the build focused:

- **Multi-tenant SaaS hosting** — each team runs their own instance
- **Direct API integrations for performance data** (PostHog, Common Room, HubSpot) — manual entry in v1, integrations are Phase 3
- **Email sending or campaign execution** — creation and tracking tool only, not an execution layer
- **Public-facing pages or external client access** — team-only
- **Intent detection for mode selection** — Phase 2 explicitly, after usage validation
- **Mobile app** — web only
- **Billing or usage metering** — self-hosted, teams bring their own API keys

---

## Open questions

Decisions needed before build starts:

| # | Question | Recommendation |
|---|---|---|
| 1 | Skills repo strategy: pin a commit inside the project, or fetch from GitHub at runtime? | Pin at a specific commit. Admin-triggered manual update flow to pull latest. Stable by default. |
| 2 | Is Quiver the source of truth for product marketing context, replacing existing Notion docs? | Yes. Quiver owns it. Notion export is a push not a pull. One source of truth. |
| 3 | License: MIT or Apache 2.0? | MIT. Simpler, more permissive, appropriate for a marketing tool with no novel IP. |
| 4 | Who are the first two teams deploying? Names and team sizes? | Informs onboarding copy and how aggressively to test multi-invite flows before launch. |
| 5 | DATABASE_URL: Supabase required, or support any Postgres via env var? | Any Postgres via env var. Supabase is the recommended default in docs but not enforced in code. |

---

## What success looks like

When Quiver is done, a product team should be able to:

1. Fork the repo, add env vars, deploy to Vercel, and have a working marketing command center in under 30 minutes
2. Complete the onboarding wizard and have a structured, AI-ready product marketing context in under 20 minutes
3. Start a Strategy session and receive recommendations specifically grounded in their product's positioning and ICP — not generic marketing advice
4. Save an artifact from any session in one click with pre-populated metadata
5. Log performance results and see AI-proposed updates to their product context
6. Invite teammates and have them immediately working in the same shared context
7. Read the README and understand exactly how to deploy, contribute, or improve the skills

That is the bar.

---

*Quiver — github.com/tessak22/quiver — MIT License*
