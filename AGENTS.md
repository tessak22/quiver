# Quiver — Agent Instructions

This file is read automatically by AI coding agents (Cursor, Polyscope, Codex, etc.).
Claude Code users: see CLAUDE.md — same content, same rules.

# Quiver — Claude Code Instructions

> Sync Notice: `CLAUDE.md` and `AGENTS.md` must remain in sync. Any rule change in one must be mirrored in the other.

This file is read automatically by Claude Code at the start of every session. It contains persistent rules that apply to all work in this repo — initial build, bug fixes, feature additions, and everything after.

For the full product specification, read `SPEC.md`. For the original Autopilot kick-off context, read `PROMPT.md`.

---

## What this project is

Quiver is a self-hosted, open source, AI-powered marketing command center for product teams. It is a context machine: every AI session starts with a complete, structured understanding of the team's product positioning, ICP, competitive landscape, past campaigns, and what has worked. The system compounds — every result logged makes the next session smarter.

This is open source (MIT). Write code as if other teams will read, fork, and deploy it.

---

## Tech stack — final, do not deviate

| Layer | Decision |
|---|---|
| Framework | Next.js 14, App Router |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Database | Supabase (Postgres) |
| ORM | Prisma |
| Auth | Supabase Auth |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) — `claude-sonnet-4-20250514` |
| Skills | Markdown files in `/skills` directory, pinned from `coreyhaines31/marketingskills` |
| Deployment | Vercel |
| Language | TypeScript strict mode throughout |

Do not introduce additional dependencies without a clear reason. If a new library is needed, use the most widely adopted option and leave a comment explaining why it was added.

---

## Skill names — authoritative list

The `/skills` directory contains a pinned copy of `coreyhaines31/marketingskills`. Only use skill names that actually exist in this repo.

- `customer-research` exists and is valid.
- `vbf-messaging` does not exist and must never be referenced. Use `product-marketing-context` instead.

### Correct skill-to-mode mapping

| Mode | Skills to load |
|---|---|
| `strategy` | `product-marketing-context`, `marketing-psychology`, `marketing-ideas`, `launch-strategy`, `competitor-alternatives` |
| `create` | Determined by artifact type — see mapping in `lib/ai/skills.ts` |
| `feedback` | `customer-research` |
| `analyze` | `analytics-tracking`, `ab-test-setup` |
| `optimize` | `page-cro`, `copy-editing`, `ab-test-setup`, `signup-flow-cro`, `onboarding-cro` |

### Valid skill names (complete list from `/skills`)

`ab-test-setup`, `ad-creative`, `ai-seo`, `analytics-tracking`, `churn-prevention`, `cold-email`, `community-marketing`, `competitor-alternatives`, `content-strategy`, `copy-editing`, `copywriting`, `customer-research`, `email-sequence`, `form-cro`, `free-tool-strategy`, `launch-strategy`, `lead-magnets`, `marketing-ideas`, `marketing-psychology`, `onboarding-cro`, `page-cro`, `paid-ads`, `paywall-upgrade-cro`, `popup-cro`, `pricing-strategy`, `product-marketing-context`, `programmatic-seo`, `referral-program`, `revops`, `sales-enablement`, `schema-markup`, `seo-audit`, `signup-flow-cro`, `site-architecture`, `social-content`

---

## Code quality standards

- TypeScript strict mode. No `any`. No `// @ts-ignore`.
- Every `lib/ai/` file opens with a comment block: what it does, what it reads from, what it produces, important edge cases.
- Every API route has explicit error handling. Never return a 500 with no body.
- Prisma for all database access. No raw SQL except in documented edge cases.
- Token-streaming routes use `ReadableStream`; polling is acceptable for async background processing states (for example research post-processing).
- shadcn components for all UI primitives. No custom button/input/dialog components.
- Server components by default. `'use client'` only where interactivity requires it.
- Numbers displayed to users go through `toFixed()` or `Intl.NumberFormat`.
- Dates displayed using `Intl.DateTimeFormat` with explicit locale.
- Empty states on every list and library view.
- Loading states on every async action.

---

## Approval gates

Pause and wait for explicit user approval before:

1. Any change to the Prisma schema after the initial migration
2. Any change to the system prompt assembly logic in `lib/ai/session.ts`
3. Any change to the skill-to-mode mapping in `lib/ai/skills.ts`

Do not pause for: UI components, API routes, lib utilities, types, bug fixes, dependency installs from the approved stack.

---

## Architectural decisions

### Core architecture

- Single workspace per deployment. One deployed instance = one product team. No multi-tenancy.
- Skills are static files loaded from `/skills` at session start (`fs.readFileSync`), not fetched at runtime.
- AI sessions stream using `anthropic.messages.stream()` and detect `[ARTIFACT READY — type: {type} | suggested title: {title}]` mid-stream to trigger artifact save UX.
- Onboarding gates the app: if no active `context_version` exists, routes redirect to `/setup`.
- `Unassigned` is the default campaign; sessions/artifacts can attach there when no explicit campaign is chosen.

### Content layer decisions

- `ContentPiece` is the top-level content object (body, status, contentType, SEO/OG metadata, campaign/context/artifact links, repurposing parent/child links).
- Public content API is published-only:
  - `GET /api/public/content` (paginated list)
  - `GET /api/public/content/[slug]` (single piece)
- Public content endpoints are rate-limited to 60 requests/minute per IP via `publicContentLimiter` (`lib/rate-limit.ts`). This limiter is in-memory per instance.
- Performance history is modeled as time-series snapshots in `ContentMetricSnapshot` (`snapshotDate` + metrics), not denormalized aggregate fields on `ContentPiece`.
- Markdown rendering in content detail UI uses `marked` and then sanitizes HTML with `DOMPurify` before rendering.

### Research layer decisions

- Research ingestion is asynchronous: `POST /api/research` creates `ResearchEntry`, returns immediately (`processing: true`), then schedules AI analysis via `waitUntil(processResearchEntry(...))`.
- `lib/ai/research.ts` is intentionally Next.js-independent (no Next imports) so it can be shared across app/MCP contexts.
- Research AI output updates the entry (`summary`, `themes`, `sentiment`, `hypothesisSignals`), extracts `ResearchQuote` rows, and can create proposal logs.
- Featured quotes (`ResearchQuote.isFeatured = true`) are injected into session prompts for `strategy` and `create` as `<customer_quotes>` context.

### MCP design decisions

- Quiver supports two MCP transports:
  - Local stdio server (`mcp/index.ts`) for desktop/local clients.
  - Remote HTTP endpoint (`/api/mcp`) using Streamable HTTP transport for connector-based clients.
- MCP HTTP auth is optional via `MCP_AUTH_SECRET` bearer token; if unset, endpoint is open by default.
- Context update safety model:
  - `propose_context_update` creates a pending proposal log for human review.
  - `apply_context_update` applies immediately by calling `applyContextUpdates()` in `lib/db/context.ts`, which creates a new context version.
- MCP proposal approval path (`action_proposal`) can also apply approved updates through `applyContextUpdates()`.
- MCP writes identify actor as `recordedBy: 'mcp'` where applicable (for example context proposal logs and direct context update actions).

### Dark mode decisions

- Tailwind dark mode is class-based (`darkMode: ['class']`).
- Theme preference persists in `localStorage` under `quiver-theme`.
- `ThemeToggle` toggles the `dark` class on `<html>` and writes `'dark' | 'light'` to localStorage.
- `app/layout.tsx` includes an inline pre-hydration script that applies the `dark` class before React hydration to prevent theme flash.

### Tabstack import status (issue #50)

- Issue #50 is planned/issued work, not currently implemented in this repository state.
- There is currently no `lib/tabstack.ts` module.
- There is currently no `/api/content/import` route.
- There is currently no MCP content import tool for Tabstack.

---

## MCP server quick reference

- Tool groups registered in both stdio and HTTP MCP servers: context, campaign, artifact, session, performance, workspace, research, content.
- Stdio entrypoint: `mcp/index.ts`.
- HTTP entrypoint: `app/api/mcp/route.ts`.
- Build command for stdio server artifact: `cd mcp && npm install && npx prisma generate && npm run build`.

---

## GitHub issues

All work is tracked in GitHub issues at `github.com/tessak22/quiver/issues`. Each issue has full acceptance criteria. Reference the issue number in every commit. Work through issues in number order unless there is a clear dependency reason to do otherwise.
