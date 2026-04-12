# Quiver - Product Specification

**Version:** 1.1  
**License:** MIT  
**Repo:** github.com/tessak22/quiver  
**Deploy target:** Vercel  
**April 2026**

---

## What is Quiver?

Quiver is a self-hosted, open source, AI-powered marketing command center for product teams.

It is not generic chat. It is a context machine: every session starts with structured product context plus what has and has not worked so far. Output quality improves as teams log more performance, research, and published content.

Each deployment is a single workspace for one team. Teams own their own database, keys, and infrastructure.

> Core principle: grounding is the product. Context and feedback loops are the differentiator.

---

## What Quiver is not

- Not a multi-tenant SaaS
- Not a CRM replacement
- Not an email sending platform
- Not an API-first data warehouse

---

## Architecture overview

Quiver currently operates as seven connected layers:

| Layer | What it does |
|---|---|
| Context | Versioned product marketing context (`context_versions`) used in every session |
| Sessions | Five explicit AI session modes with skill loading and prompt assembly |
| Artifacts | Versioned output library with status workflow and campaign links |
| Performance | Metric + qualitative logs with proposal workflow and close-the-loop queue |
| Content | Markdown content store with SEO/OG metadata, distribution tracking, and metric snapshots |
| Research | Research entries + extracted quote library with async AI processing |
| MCP | Tool surface for external MCP clients (stdio server + HTTP endpoint) |

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
| AI | Anthropic SDK (`claude-sonnet-4-20250514`) |
| Skills | Markdown files pinned in `/skills` |
| MCP | `mcp/` stdio server + `/api/mcp` Streamable HTTP endpoint |
| Deployment | Vercel |
| Language | TypeScript strict mode |

---

## Database schema

### `context_versions`
Versioned product marketing context. Exactly one active row.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| version | int | Incrementing version number |
| isActive | bool | Active context marker |
| positioningStatement | text | Positioning statement |
| icpDefinition | jsonb | ICP structure |
| messagingPillars | jsonb | Messaging framework |
| competitiveLandscape | jsonb | Competitor notes |
| customerLanguage | jsonb | VoC language store |
| proofPoints | jsonb | Claims and proof |
| activeHypotheses | jsonb | Hypothesis list |
| brandVoice | text | Voice guidance |
| wordsToUse | text[] | Preferred vocabulary |
| wordsToAvoid | text[] | Banned vocabulary |
| updatedBy | text | Actor |
| updateSource | text | `manual` / `ai_proposed` / etc |
| changeSummary | text | Reason for new version |
| createdAt | timestamptz | Auto-set |

### `campaigns`
Top-level initiative container.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| name | text | Campaign name |
| description | text | Optional description |
| goal | text | Target outcome |
| channels | text[] | Planned channels |
| status | text | `planning` / `active` / `paused` / `complete` / `archived` |
| priority | text | `high` / `medium` / `low` |
| startDate | timestamptz | Optional |
| endDate | timestamptz | Optional |
| ownerId | text | Optional owner |
| contextVersionId | uuid FK | Context snapshot when created |
| links | jsonb | Optional label/url pairs |
| createdAt | timestamptz | Auto-set |
| updatedAt | timestamptz | Auto-updated |

**Relations now include:** `sessions`, `artifacts`, `performanceLogs`, `researchEntries`, `contentPieces`.

### `sessions`
Saved AI conversations.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| title | text | User-editable title |
| mode | text | `strategy` / `create` / `feedback` / `analyze` / `optimize` |
| skillsLoaded | text[] | Loaded skill names |
| messages | jsonb | Full conversation history |
| campaignId | uuid FK | Optional campaign |
| contextVersionId | uuid FK | Context used |
| createdBy | text | Actor |
| createdAt | timestamptz | Auto-set |
| updatedAt | timestamptz | Auto-updated |
| isArchived | bool | Soft archive |

### `artifacts`
Saved generated work with version chain.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| title | text | Artifact title |
| type | text | Artifact type |
| content | text | Artifact body |
| status | text | `draft` / `review` / `approved` / `live` / `archived` |
| skillUsed | text | Optional skill label |
| campaignId | uuid FK | Required campaign |
| sessionId | uuid FK | Source session |
| contextVersionId | uuid FK | Context snapshot |
| version | int | Version number |
| parentArtifactId | uuid FK | Parent artifact version |
| tags | text[] | Optional tags |
| createdBy | text | Actor |
| createdAt | timestamptz | Auto-set |
| updatedAt | timestamptz | Auto-updated |

### `performance_logs`
Performance + proposal records.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| artifactId | uuid FK | Optional artifact |
| campaignId | uuid FK | Required campaign |
| logType | text | `artifact` / `campaign` / `context_proposal` / etc |
| metrics | jsonb | Metric payload |
| qualitativeNotes | text | Notes |
| whatWorked | text | Synthesis summary |
| whatDidnt | text | Synthesis summary |
| proposedContextUpdates | jsonb | Proposed context edits |
| contextUpdateStatus | text | `pending` / `approved` / `rejected` / `na` |
| recordedBy | uuid FK | Team member (or `mcp` for MCP-initiated writes) |
| recordedAt | timestamptz | Auto-set |
| periodStart | timestamptz | Optional |
| periodEnd | timestamptz | Optional |

### `research_entries` (Issue #47)
Raw customer research records.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| title | text | Entry title |
| sourceType | text | call/interview/survey/review/forum/support_ticket/social/common_room/other |
| contactName | text | Optional |
| contactCompany | text | Optional |
| contactSegment | text | Optional |
| contactStage | text | Optional lifecycle stage |
| researchDate | timestamptz | Optional source date |
| rawNotes | text | Raw notes/transcript |
| summary | text | AI summary |
| themes | text[] | AI themes |
| sentiment | text | AI sentiment |
| productSignal | bool | Product issue flag |
| productNote | text | Product signal notes |
| hypothesisSignals | jsonb | Signal map vs active hypotheses |
| campaignId | uuid FK | Optional campaign |
| createdBy | text | Actor |
| createdAt | timestamptz | Auto-set |
| updatedAt | timestamptz | Auto-updated |

### `research_quotes` (Issue #47)
Extracted Voice of Customer quotes.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| researchEntryId | uuid FK | Parent entry |
| quote | text | Verbatim quote |
| context | text | Optional surrounding context |
| theme | text | Optional theme |
| segment | text | Optional segment |
| isFeatured | bool | Featured quote flag for prompt injection |
| createdAt | timestamptz | Auto-set |

### `content_pieces` (Issue #49)
Top-level content object (not an artifact subtype).

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| title | text | Content title |
| slug | text unique | Public slug |
| contentType | text | blog_post/case_study/landing_page/changelog/newsletter/social_thread/video_script/doc/other |
| status | text | `draft` / `review` / `approved` / `published` / `archived` |
| body | text | Markdown body |
| excerpt | text | Optional excerpt |
| metaTitle | text | SEO title |
| metaDescription | text | SEO description |
| targetKeyword | text | Primary keyword |
| secondaryKeywords | text[] | Secondary keywords |
| canonicalUrl | text | Canonical URL |
| ogTitle | text | OG title |
| ogDescription | text | OG description |
| ogImageUrl | text | OG image |
| twitterCardType | text | Twitter card type |
| publishedAt | timestamptz | Publish date |
| campaignId | uuid FK | Optional campaign |
| parentContentId | uuid FK | Repurpose parent |
| artifactId | uuid FK | Optional source artifact |
| contextVersionId | uuid FK | Optional context snapshot |
| createdBy | text | Actor |
| createdAt | timestamptz | Auto-set |
| updatedAt | timestamptz | Auto-updated |

### `content_distributions` (Issue #49)
Publication/distribution records for each channel.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| contentPieceId | uuid FK | Parent content |
| channel | text | website/dev_to/hashnode/medium/newsletter/linkedin/twitter/youtube/other |
| url | text | Channel URL |
| publishedAt | timestamptz | Channel publish date |
| status | text | `planned` / `published` / `archived` |
| notes | text | Optional notes |
| createdAt | timestamptz | Auto-set |

### `content_metric_snapshots` (Issue #49)
Time-series content metrics.

| Column | Type | Description |
|---|---|---|
| id | uuid PK | Auto-generated |
| contentPieceId | uuid FK | Parent content |
| snapshotDate | timestamptz | Snapshot date |
| pageviews | int | Optional metric |
| uniqueVisitors | int | Optional metric |
| avgTimeOnPage | int | Optional metric (seconds) |
| bounceRate | float | Optional metric |
| organicClicks | int | Optional metric |
| impressions | int | Optional metric |
| avgPosition | float | Optional metric |
| ctr | float | Optional metric |
| socialShares | int | Optional metric |
| backlinks | int | Optional metric |
| comments | int | Optional metric |
| signups | int | Optional metric |
| conversionRate | float | Optional metric |
| source | text | `manual` / `mcp_pull` / `scheduled_sync` |
| notes | text | Optional notes |
| recordedBy | text | Actor |
| createdAt | timestamptz | Auto-set |

### `team_members`
Supabase-auth-linked member table.

| Column | Type | Description |
|---|---|---|
| id | text PK | Supabase user ID |
| name | text | Display name |
| email | text unique | Email |
| role | text | `admin` / `member` / `viewer` |
| createdAt | timestamptz | Auto-set |

---

## Feature specifications

### 4.1 Marketing context

- Structured context fields with version history
- Manual edits and AI-proposed updates
- Proposal review flow before apply
- Restore previous context versions
- Active version auto-injected into every session

### 4.2 AI session modes

| Mode | Purpose | Skills |
|---|---|---|
| Strategy | Positioning, GTM, messaging decisions | `product-marketing-context`, `marketing-psychology`, `marketing-ideas`, `launch-strategy`, `competitor-alternatives` |
| Create | Produce marketing assets | Skill mapping by artifact type |
| Feedback | Synthesize raw notes/metrics | `customer-research` |
| Analyze | Analyze results and trends | `analytics-tracking`, `ab-test-setup` |
| Optimize | CRO and iteration work | `page-cro`, `copy-editing`, `ab-test-setup`, `signup-flow-cro`, `onboarding-cro` |

Prompt assembly order remains:
1. Role definition
2. Product context
3. Skill frameworks
4. Performance history (create mode)
5. Featured customer quotes (create + strategy)
6. Published content context (create + strategy)
7. Mode instructions
8. Output instructions

### 4.3 Artifact library

- Status workflow: Draft -> Review -> Approved -> Live -> Archived
- Version chain via parent/child artifact links
- Campaign links and performance links
- Close-the-loop reminder creation when moved to `live`

### 4.4 Campaigns

- Campaign CRUD with status and priority
- Campaign-level linking to sessions, artifacts, research entries, and content pieces
- Aggregated performance rollups and dashboard summaries

### 4.5 Performance log

- Manual log entry with metrics + qualitative notes
- AI synthesis path for what worked/what did not
- Proposal lifecycle (`pending`, `approved`, `rejected`)
- Close-the-loop queue surfaced on dashboard and MCP

### 4.6 Dashboard

- Active campaigns summary
- Recent sessions and artifacts
- Pending proposal counts
- Close-the-loop queue

### 4.7 Team and settings

- Team invites and role management
- Skills pinned-version management
- Theme toggle (light/dark)
- Sharing secret and workspace settings

---

## Content layer (Issue #49)

### Data model

Implemented with:
- `ContentPiece`
- `ContentDistribution`
- `ContentMetricSnapshot`

### Product behavior

- Library view tabs: All, Calendar, Drafts
- New content form sections: Content, SEO, OG/Social
- Detail page tabs: Preview, Edit, SEO, OG
- Distribution tracking per channel
- Repurposed content links via `parentContentId`
- Metric snapshots with sparkline and snapshot history

### Public API (website pull mechanism)

- `GET /api/public/content/[slug]`
- `GET /api/public/content`

Notes:
- Public endpoints return published content only.
- Endpoints are unauthenticated and rate-limited (in-memory limiter, per instance).

### Prompt injection

Published content summaries are injected into Strategy and Create system prompts as `<published_content>` context.

### MCP tools

- `list_content`
- `get_content`
- `save_content`
- `update_content`
- `add_distribution`
- `log_content_metrics`
- `get_content_metrics`
- `get_content_calendar`

---

## Customer research layer (Issue #47)

### Data model

Implemented with:
- `ResearchEntry`
- `ResearchQuote`

### Product behavior

- Research page has Entries and Quotes tabs
- New entry form captures source metadata + raw notes
- Entry detail surfaces AI summary, themes, sentiment, hypothesis signals, and extracted quotes
- VoC quote library supports `isFeatured` starring
- Featured quotes are injected into Create and Strategy prompts
- Hypothesis signals are tracked per entry against active hypotheses
- "Push to Linear" flow is clipboard payload generation in UI and MCP tooling, not direct Linear API writes

### AI processing

`lib/ai/research.ts` runs asynchronously after entry save.

Processing pipeline:
- Summarize entry
- Extract themes
- Infer sentiment
- Build hypothesis signals
- Extract quotes
- Generate context proposals when supported

### MCP tools

- `list_research_entries`
- `get_research_entry`
- `save_research_entry`
- `list_quotes`
- `get_linear_payload`

---

## MCP server (Issue #26)

Quiver exposes tool access over two transports:
- Local stdio server in `mcp/`
- Remote Streamable HTTP endpoint at `/api/mcp`

### Primary use case

A fully configured Claude instance (memory, other connected MCP servers, and team context) can write to and read from Quiver directly while Quiver remains the system of record.

### Tool domains

Context:
- `get_context`
- `get_context_history`
- `propose_context_update`
- `apply_context_update`
- `restore_context_version`

Campaigns:
- `list_campaigns`
- `get_campaign`
- `create_campaign`
- `update_campaign`
- `update_campaign_status`

Artifacts:
- `list_artifacts`
- `get_artifact`
- `save_artifact`
- `update_artifact`
- `update_artifact_status`

Performance:
- `log_performance`
- `get_performance_log`
- `get_close_the_loop_queue`
- `list_proposals`
- `action_proposal`

Content:
- `list_content`
- `get_content`
- `save_content`
- `update_content`
- `add_distribution`
- `log_content_metrics`
- `get_content_metrics`
- `get_content_calendar`

Research:
- `list_research_entries`
- `get_research_entry`
- `save_research_entry`
- `list_quotes`
- `get_linear_payload`

Sessions:
- `list_sessions`
- `get_session`

Workspace:
- `get_dashboard_summary`

### `propose_context_update` vs `apply_context_update`

- `propose_context_update`: creates a pending proposal record in `performance_logs`; does not modify active context.
- `apply_context_update`: applies changes immediately by calling `applyContextUpdates()` and creating a new active context version.

### Setup summary

Stdio server:
```bash
cd mcp
npm install
npx prisma generate
npm run build
```

Claude Desktop / Cursor use the built `mcp/dist/index.js` command.

Remote HTTP connector uses deployed endpoint:
- `https://<your-domain>/api/mcp`
- Optional `MCP_AUTH_SECRET` Bearer token for auth.

---

## Scheduled sync strategy (Issue #39, reframed)

MCP-first remains the primary path for external metric pulls.

- Teams can ask an MCP-capable client to pull data from connected services and log into Quiver in the same workflow.
- Scheduled sync remains Phase 3 and is intended for teams needing fully automatic pulls.
- Current plan narrows scheduled sync to PostHog first.

---

## Dark mode (Issue #45)

Implemented.

- User-selectable light/dark mode
- `localStorage` key: `quiver-theme`
- Tailwind config uses class mode (`darkMode: ['class']`)
- Inline script in `app/layout.tsx` runs before hydration to avoid flash of incorrect theme
- `ThemeToggle` appears in app shell header

---

## Tabstack content import (Issue #50)

Status in this checkout: **issued but not implemented yet**.

Planned design:
- Optional `TABSTACK_API_KEY` env var
- Shared client wrapper `lib/tabstack.ts`
- `POST /api/content/import` using Tabstack `/extract/json`
- Import modal in content library
- Graceful degradation when key is absent

Until implemented, docs should treat this as planned scope and not shipped behavior.

---

## Navigation and UX principles

### Core workspace navigation (8 primary work areas)

- Dashboard
- Sessions
- Artifacts
- Campaigns
- Content
- Research
- Context
- Performance

Docs/help route may exist as an additional navigation item, but these eight remain the core work areas.

### UX principles

- Fast path to new session
- Context always visible and versioned
- Every output can connect back to campaign and performance
- No orphans: work belongs to campaign scope (`Unassigned` fallback when needed)
- Team-visible by default inside one deployment workspace

---

## Build order

Build and validation order by dependency:

| Phase | Deliverable | Notes / dependencies |
|---|---|---|
| 1 | Foundation: schema, auth, onboarding, context | Base product layers |
| 2 | Sessions + artifacts + campaigns + performance loop | Core workflow |
| 3 | MCP server (Issue #26) | Tooling access for external clients |
| 4 | Dark mode (Issue #45) | UX improvement, no schema impact |
| 5 | Research layer (Issue #47) | Depends on campaigns/context/performance |
| 6 | Content layer (Issue #49) | Depends on campaigns/context + public API |
| 7 | Tabstack import (Issue #50) | Optional add-on to content workflow |
| 8 | Scheduled sync (Issue #39, Phase 3) | Defer until MCP-first workflow proven in production |

---

## Deploy story

### Self-hosted on Vercel

1. Fork repository
2. Create Supabase project
3. Create Anthropic API key
4. Configure env vars in Vercel
5. Run migrations
6. Complete onboarding

### Environment variables

```env
# Database
DATABASE_URL=
DIRECT_URL=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
QUIVER_SHARE_SECRET=

# Optional MCP HTTP auth
MCP_AUTH_SECRET=

# Optional planned content import (Issue #50, not yet implemented in this checkout)
TABSTACK_API_KEY=
```

---

## Out of scope

- Multi-tenant hosted SaaS model
- Built-in outbound campaign execution/send infrastructure
- Mobile-native app
- Scheduled sync before MCP-first workflow is validated
- Broad direct integrations as the primary path (MCP-first is primary; scheduled sync is selective and later)

---

## Success criteria

A team should be able to:

1. Deploy in under 30 minutes
2. Complete onboarding and start sessions quickly
3. Generate grounded outputs using real context
4. Save artifacts/content and link work to campaigns
5. Log research and performance, then review context proposals
6. Use MCP clients to interact with Quiver data directly
7. Operate with clear version history and shared team visibility

---

*Quiver - github.com/tessak22/quiver - MIT License*
