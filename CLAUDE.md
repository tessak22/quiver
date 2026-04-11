# Quiver — Claude Code Instructions

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

The `/skills` directory contains a pinned copy of `coreyhaines31/marketingskills`. Only use skill names that actually exist in that repo. The following names do **not** exist and must never be referenced:

- `vbf-messaging` — does not exist. Use `copywriting` instead.
- `customer-research` — does not exist. Use `product-marketing-context` instead.

### Correct skill-to-mode mapping

| Mode | Skills to load |
|---|---|
| `strategy` | `marketing-psychology`, `marketing-ideas`, `launch-strategy`, `competitor-alternatives`, `copywriting` |
| `create` | Determined by artifact type — see mapping in `lib/ai/skills.ts` |
| `feedback` | `product-marketing-context` |
| `analyze` | `analytics-tracking`, `ab-test-setup` |
| `optimize` | `page-cro`, `copy-editing`, `ab-test-setup`, `signup-flow-cro`, `onboarding-cro` |

### Valid skill names (complete list)

`ab-test-setup`, `ad-creative`, `ai-seo`, `analytics-tracking`, `churn-prevention`, `cold-email`, `competitor-alternatives`, `content-strategy`, `copy-editing`, `copywriting`, `email-sequence`, `form-cro`, `free-tool-strategy`, `launch-strategy`, `marketing-ideas`, `marketing-psychology`, `onboarding-cro`, `page-cro`, `paid-ads`, `paywall-upgrade-cro`, `popup-cro`, `pricing-strategy`, `product-marketing-context`, `programmatic-seo`, `referral-program`, `revops`, `sales-enablement`, `schema-markup`, `seo-audit`, `signup-flow-cro`, `site-architecture`, `social-content`

---

## Code quality standards

- TypeScript strict mode. No `any`. No `// @ts-ignore`.
- Every `lib/ai/` file opens with a comment block: what it does, what it reads from, what it produces, important edge cases.
- Every API route has explicit error handling. Never return a 500 with no body.
- Prisma for all database access. No raw SQL except in documented edge cases.
- All streaming routes use `ReadableStream`. No polling.
- shadcn components for all UI primitives. No custom button/input/dialog components.
- Server components by default. `'use client'` only where interactivity requires it — always with a comment explaining why.
- Numbers displayed to users go through `toFixed()` or `Intl.NumberFormat`. No raw float output.
- Dates displayed using `Intl.DateTimeFormat` with explicit locale. No raw `Date.toString()`.
- Empty states on every list and library view — a new workspace with no data should look intentional, not broken.
- Loading states on every async action. No UI that hangs silently.

---

## Approval gates

Pause and wait for explicit user approval before:

1. Any change to the Prisma schema after the initial migration
2. Any change to the system prompt assembly logic in `lib/ai/session.ts`
3. Any change to the skill-to-mode mapping in `lib/ai/skills.ts`

Do not pause for: UI components, API routes, lib utilities, types, bug fixes, dependency installs from the approved stack.

---

## Key architectural decisions

- **Single workspace per deployment.** One deployed instance = one product team. No multi-tenancy.
- **Skills are static files.** Loaded from `/skills` at session start via `fs.readFileSync`. Not fetched at runtime.
- **Streaming for all AI sessions.** Use `anthropic.messages.stream()`. Never non-streaming calls for sessions.
- **`[ARTIFACT READY — type: {type} | suggested title: {title}]`** is the marker that triggers the artifact save UI. Detect it mid-stream.
- **Onboarding gates the entire app.** If no active `context_version` row exists, all routes redirect to `/setup`.
- **`Unassigned` is the default campaign.** Every session and artifact must belong to a campaign. Auto-create `Unassigned` on first run.

---

## MCP server

The `mcp/` directory contains a Model Context Protocol server that exposes Quiver's full functionality as tools for external AI clients. Key points:

- **Two context update tools exist:** `propose_context_update` (creates a pending proposal for human review — use by default) and `apply_context_update` (applies immediately via `applyContextUpdates()` from `lib/db/context.ts` — use only when the human has explicitly stated the change). Both are required; omitting `apply_context_update` would make the MCP less capable than the UI.
- **Synthesis:** `lib/ai/synthesis-core.ts` extracts the AI performance synthesis logic for shared use by both the Next.js API and MCP server. Both import from this module.
- **Transport:** stdio. No HTTP, no port, no auth token. `DATABASE_URL` is the credential.
- **Build:** `cd mcp && npm install && npx prisma generate && npm run build` — produces `mcp/dist/index.js`.
- **`recordedBy`:** MCP actions use the string `'mcp'` as the user identifier for all writes.

---

## GitHub issues

All work is tracked in GitHub issues at `github.com/tessak22/quiver/issues`. Each issue has full acceptance criteria. Reference the issue number in every commit. Work through issues in number order unless there is a clear dependency reason to do otherwise.
