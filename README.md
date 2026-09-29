# Quiver

**A developer marketing system.** Marketing work is scattered across chats, documents, project tools, publishing systems and analytics — so every AI session starts by reconstructing the company, and what worked last time never reaches the next decision.

Quiver keeps product context, customer evidence, campaigns, content, distribution and performance connected, and gives people and agents the same approved understanding to work from.

This repository is the **self-hosted edition**, MIT licensed. There is also a [hosted version at quivergtm.dev](https://www.quivergtm.dev).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftessak22%2Fquiver&env=DATABASE_URL,DIRECT_URL,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,ANTHROPIC_API_KEY,NEXT_PUBLIC_APP_URL,QUIVER_SHARE_SECRET,CRON_SECRET)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What makes it different from a chat window

A general assistant gives you output. Quiver gives the operation the things software teams expect and marketing tools usually lack:

- **Context is approved, versioned state — not a prompt.** Positioning, ICP, messaging, proof and hypotheses live in a document with history, and changes go through review.
- **Explicit production states.** Draft is not approved, and approved is not live. A person decides what becomes true and what ships.
- **Campaigns are a real object.** Sessions, research, artifacts, content and performance attach to one, so a launch is inspectable rather than remembered.
- **Research becomes evidence.** Customer language and quotes are extracted once and reused, instead of being summarised away.
- **Content infrastructure, not only generation.** Versions, publish state, distribution, lineage, and a public API your website reads.
- **Agents operate it through MCP.** External AI clients run real workflows against your data rather than returning isolated answers.
- **A human-approved feedback loop.** Results are logged, patterns are proposed, and nothing rewrites what the company believes on its own.

---

## The loop

1. **Set the context.** Onboarding drafts your positioning, ICP, messaging and proof; you correct it. Everything downstream reads from this.
2. **Bring evidence.** Paste a call transcript or notes; Quiver extracts quotes and themes into a reusable library.
3. **Run a session.** Five modes — Strategy, Create, Feedback, Analyze, Optimize — each loaded with the relevant marketing skills and your real context.
4. **Save the work.** Sessions produce artifacts that move draft → review → approved → live, attached to a campaign.
5. **Publish.** Content carries SEO and social metadata, records where it went live, and is served to your own site through the Content API.
6. **Close the loop.** Log what happened. Quiver proposes what your context should learn from it, and you approve or reject.

---

## What is in the app

| Area | What it does |
|---|---|
| **Context** | The product marketing source of truth, versioned, with a review queue for proposed changes |
| **Sessions** | AI chat in five modes, grounded in context, skills and past results |
| **Artifacts** | The library of saved work, with status flow, version history and campaign links |
| **Campaigns** | The object that ties sessions, research, artifacts, content and results together |
| **Content** | Pieces with markdown bodies, SEO and OG metadata, publish state, distribution records and metric snapshots |
| **Research** | Customer interviews and notes, processed into quotes and themes |
| **Performance** | Logged results, the close-the-loop queue, and proposed context updates |
| **Settings** | Team, skills, notifications and API access |

---

## Self-hosting

Vercel and Supabase, about thirty minutes.

1. **Fork** this repo
2. **Create a [Supabase](https://supabase.com) project**
3. **Get an [Anthropic API key](https://console.anthropic.com/settings/keys)**
4. **Deploy to Vercel** with the button above
5. **Run the migrations** against your database:
   ```bash
   npx prisma migrate deploy
   ```
6. **Visit your deployment URL** and complete onboarding

Running locally:

```bash
npm install
cp .env.example .env.local   # fill in the values below
npx prisma migrate deploy
npm run dev
```

---

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (pooled) |
| `DIRECT_URL` | Yes | Direct connection, used for Prisma migrations |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase service role key |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `NEXT_PUBLIC_APP_URL` | Yes | App URL (`https://...` or `http://localhost:3000`) |
| `QUIVER_SHARE_SECRET` | Yes | Signs session share links — `openssl rand -base64 32` |
| `CRON_SECRET` | Yes in production | Bearer token Vercel sends to `/api/cron/pattern-report`. Without it the job answers 200 and does nothing, so the monthly pattern report never runs. `openssl rand -base64 32` |
| `MCP_AUTH_SECRET` | No | Bearer auth for `/api/mcp`. Unset means the endpoint accepts any caller — set it unless the deployment is private |

---

## Content API

Published content is available from Quiver via a public, unauthenticated API:

```txt
GET /api/public/content/[slug]   # single published piece with markdown body + SEO/OG
GET /api/public/content          # paginated list of published pieces
```

Query params for list endpoint:

- `contentType` (optional)
- `limit` (default `20`, max `50`)
- `offset` (default `0`)

Both endpoints are rate-limited to `60` requests/minute per IP (in-memory limiter per app instance).

Use this API at build time or runtime in your website. Quiver stays the source of truth.

---

---

## MCP Server

Quiver ships with an MCP server that exposes the full product surface as tools for Claude Desktop, Cursor, Windsurf, and other MCP-compatible clients.

### Why this matters

A better-informed Claude instance (project memory + connected services + Quiver MCP tools) can log performance, save research, update context, and manage content directly, while Quiver remains the storage and tracking system.

### Build (stdio server)

```bash
cd mcp
npm install
npx prisma generate
npm run build
```

### Claude Desktop config (stdio)

```json
{
  "mcpServers": {
    "quiver": {
      "command": "node",
      "args": ["/absolute/path/to/quiver/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "your-supabase-connection-string"
      }
    }
  }
}
```

> **Note:** `ANTHROPIC_API_KEY` is optional for the stdio server. The only tool that uses it is `log_performance` — it runs AI synthesis after logging results to propose context updates. Without the key, `log_performance` still works but skips synthesis.

### Cursor config (stdio)

```json
{
  "mcpServers": {
    "quiver": {
      "command": "node",
      "args": ["/absolute/path/to/quiver/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "your-supabase-connection-string"
      }
    }
  }
}
```

### Remote HTTP connector (`/api/mcp`)

Quiver also includes a Streamable HTTP MCP endpoint in the Next.js app:

```txt
https://<your-domain>/api/mcp
```

- Set `MCP_AUTH_SECRET` to require `Authorization: Bearer <secret>`
- Without `MCP_AUTH_SECRET`, endpoint allows requests (safe only for private/internal deployments)

### Tool domains

Context:
- `get_context`, `get_context_history`, `propose_context_update`, `apply_context_update`, `restore_context_version`

Campaigns:
- `list_campaigns`, `get_campaign`, `create_campaign`, `update_campaign`, `update_campaign_status`

Artifacts:
- `list_artifacts`, `get_artifact`, `save_artifact`, `update_artifact`, `update_artifact_status`

Performance:
- `log_performance`, `get_performance_log`, `get_close_the_loop_queue`, `list_proposals`, `action_proposal`

Content:
- `list_content`, `get_content`, `save_content`, `update_content`, `add_distribution`, `log_content_metrics`, `get_content_metrics`, `get_content_calendar`

Research:
- `list_research_entries`, `get_research_entry`, `save_research_entry`, `list_quotes`, `get_linear_payload`

Sessions:
- `list_sessions`, `get_session`

Workspace:
- `get_dashboard_summary`

### `propose_context_update` vs `apply_context_update`

- **`propose_context_update`**: creates a pending proposal for human review
- **`apply_context_update`**: applies changes immediately and creates a new context version

Use `apply_context_update` only when the user explicitly asks for immediate change.

---

---

## How sessions are built

Every session prompt is assembled from the same parts, in order: the role, your active product context, the loaded skills, performance history and featured customer quotes where relevant, published content, then the mode and output instructions. See `lib/ai/session.ts`.

Skills are markdown loaded from `/skills` at session start, pinned from [marketingskills](https://github.com/coreyhaines31/marketingskills). Which skills load depends on the mode, and in Create mode on the artifact type. See `lib/ai/skills.ts` for the mapping; admins can update to a newer pinned version from Settings.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14, App Router |
| Language | TypeScript, strict |
| Styling | Tailwind CSS |
| Components | shadcn/ui + Radix |
| Database | Supabase (Postgres) |
| ORM | Prisma |
| Auth | Supabase Auth |
| AI | Anthropic |
| Testing | Vitest |
| Deployment | Vercel |

---

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

Worth knowing before you start:

- `npm run build` is the gate — it runs lint as well as the type check.
- Tests are Vitest: `npx vitest run`.
- Database changes need a migration, not just a schema edit.

---

## Documentation

- Product specification: [`SPEC.md`](SPEC.md)
- Agent instructions: [`CLAUDE.md`](CLAUDE.md), [`AGENTS.md`](AGENTS.md)
- Build prompt context: [`PROMPT.md`](PROMPT.md)

---

## License

[MIT](LICENSE) for Quiver's own source.

The `/skills` directory is a vendored copy of
[marketingskills](https://github.com/coreyhaines31/marketingskills), pinned in
`skills/PINNED_VERSION` and licensed MIT by its own authors — see
[`skills/LICENSE`](skills/LICENSE).
