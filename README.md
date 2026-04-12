# Quiver

An open-source, self-hosted, AI-powered marketing command center for product teams. Every AI session starts grounded in your product's actual positioning, ICP, competitive landscape, and past performance. The system compounds: every result logged makes the next session smarter.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftessak22%2Fquiver&env=DATABASE_URL,DIRECT_URL,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,ANTHROPIC_API_KEY,NEXT_PUBLIC_APP_URL,QUIVER_SHARE_SECRET)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Self-Hosting (30 minutes)

1. **Fork** this repo
2. **Create a [Supabase](https://supabase.com) project** — free tier works
3. **Get an [Anthropic API key](https://console.anthropic.com/settings/keys)**
4. **Deploy to Vercel** using the button above — paste your env vars when prompted
5. **Run the Prisma migration** against your Supabase database:
   ```bash
   npx prisma migrate deploy
   ```
6. **Visit your deployment URL** — the onboarding wizard launches automatically on first run
7. **Complete onboarding**, invite your team, and start working

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in every value. Here is where to find each one:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase: Settings > Database > Connection string > URI (use **connection pooler**) |
| `DIRECT_URL` | Supabase: Settings > Database > Connection string > URI (use **direct connection**) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase: Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase: Settings > API > Project API keys > `anon / public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase: Settings > API > Project API keys > `service_role` (server-side only, never expose to client) |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL (e.g. `https://quiver.yourteam.com`) or `http://localhost:3000` for local dev |
| `QUIVER_SHARE_SECRET` | Secret for generating session share links. Generate with: `openssl rand -base64 32`. Without this, sharing returns an error. |

---

## Skills System

Quiver's intelligence layer comes from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) — a collection of markdown skill files that define frameworks for every marketing task.

**How skills are stored:** The `/skills` directory contains a pinned copy of the marketingskills repo. The exact commit is recorded in `/skills/PINNED_VERSION`.

**How skills are loaded:** When an AI session starts, `lib/ai/skills.ts` reads the relevant skill files based on session mode and injects them into the system prompt. Skills are static files shipped with the app — they are not fetched at runtime.

**How to update skills:** An admin can update skills from the Settings page, which pulls the latest commit from the marketingskills repo and updates `PINNED_VERSION`.

**Skill-to-mode mapping:**

| Session Mode | Skills Loaded |
|---|---|
| Strategy | product-marketing-context, marketing-psychology, marketing-ideas, launch-strategy, competitor-alternatives |
| Create | Determined by artifact type (e.g. `email_sequence` loads email-sequence, `landing_page` loads copywriting + page-cro) |
| Feedback | customer-research |
| Analyze | analytics-tracking, ab-test-setup |
| Optimize | page-cro, copy-editing, ab-test-setup, signup-flow-cro, onboarding-cro |

See `lib/ai/skills.ts` for the complete artifact type mapping.

---

## System Prompt Assembly

Every AI session assembles a system prompt from six sections, in order:

1. **Role definition** — expert B2B marketing strategist grounded in this team's context
2. **Product context** — the active `context_version` row (positioning, ICP, messaging, competitive landscape, brand voice, etc.)
3. **Skill frameworks** — markdown skill files loaded based on session mode
4. **Performance history** — recent artifacts of the same type with logged results (create mode only)
5. **Mode instructions** — mode-specific output format and behavior
6. **Output instructions** — artifact-ready marker format for the save UI

Full implementation: [`lib/ai/session.ts`](lib/ai/session.ts)

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14, App Router |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS |
| Components | shadcn/ui + Radix UI |
| Database | Supabase (Postgres) |
| ORM | Prisma |
| Auth | Supabase Auth |
| AI | Anthropic SDK — claude-sonnet-4-20250514 |
| Testing | Vitest |
| Deployment | Vercel |

---

## MCP Server

Quiver ships with a built-in [Model Context Protocol](https://modelcontextprotocol.io) server that exposes all functionality as tools. This lets you use a more capable Claude model (Claude Desktop, Cursor, Windsurf, or claude.ai with MCP connectors) to interact with your Quiver data directly — log performance, create campaigns, save artifacts, update context — without switching to the browser.

Each team that deploys Quiver runs their own MCP server pointed at their own database.

### Build

```bash
cd mcp
npm install
npx prisma generate
npm run build
```

### Claude Desktop

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "quiver": {
      "command": "node",
      "args": ["/absolute/path/to/quiver/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "your-supabase-connection-string",
        "ANTHROPIC_API_KEY": "your-anthropic-api-key"
      }
    }
  }
}
```

### Cursor

Add this to your Cursor MCP settings (`.cursor/mcp.json` in your project, or global settings):

```json
{
  "mcpServers": {
    "quiver": {
      "command": "node",
      "args": ["/absolute/path/to/quiver/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "your-supabase-connection-string",
        "ANTHROPIC_API_KEY": "your-anthropic-api-key"
      }
    }
  }
}
```

### claude.ai with MCP connectors

The default transport is stdio (local). To use with claude.ai or other remote MCP clients, you would need to expose the server via a lightweight HTTP wrapper. The stdio transport is the recommended default for local use.

### Available Tools

| Tool | Description |
|---|---|
| `get_dashboard_summary` | Workspace overview — call first to orient |
| `get_context` | Active product marketing context |
| `get_context_history` | Context version history |
| `propose_context_update` | Propose context changes (pending human review) |
| `apply_context_update` | Apply context changes immediately (human-directed only) |
| `restore_context_version` | Restore a previous context version |
| `list_campaigns` | List campaigns by status |
| `get_campaign` | Campaign details by ID or name |
| `create_campaign` | Create a new campaign |
| `update_campaign` | Update campaign fields |
| `update_campaign_status` | Change campaign status |
| `list_artifacts` | List artifacts with filters |
| `get_artifact` | Full artifact content by ID or title |
| `save_artifact` | Save a new artifact |
| `update_artifact` | Update artifact (creates new version) |
| `update_artifact_status` | Change artifact status (live triggers reminder) |
| `log_performance` | Log results with AI synthesis |
| `get_performance_log` | Performance log entries |
| `get_close_the_loop_queue` | Artifacts awaiting results |
| `list_proposals` | Pending context update proposals |
| `action_proposal` | Approve or reject a proposal |
| `list_sessions` | Recent AI sessions |
| `get_session` | Full session with messages |

### `propose_context_update` vs `apply_context_update`

- **`propose_context_update`** (default, safe): Creates a pending proposal visible in the Quiver UI. Use when AI is suggesting changes based on analysis.
- **`apply_context_update`** (immediate): Applies changes instantly with no review step. Use only when the human has explicitly stated the exact change they want.

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for local dev setup, branch naming, how to add a new skill, and the PR checklist.

---

## Documentation

- Full product specification: [`SPEC.md`](SPEC.md)
- Build prompt: [`PROMPT.md`](PROMPT.md)

---

## License

[MIT](LICENSE)

---

*Built with the [marketingskills](https://github.com/coreyhaines31/marketingskills) framework by [@coreyhaines31](https://github.com/coreyhaines31).*
