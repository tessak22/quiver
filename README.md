# Quiver

**Finally, marketing that makes sense to engineers.**

Quiver is an open-source, self-hosted **agentic developer marketing system** for technical founders and teams building developer tools. It connects product context, customer research, campaigns, content, and results, so the next piece of work starts with what your team knows—not another empty chat. Work in the web app or through MCP-compatible clients; keep the history and decisions in Quiver.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftessak22%2Fquiver&env=DATABASE_URL,DIRECT_URL,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,ANTHROPIC_API_KEY,NEXT_PUBLIC_APP_URL,QUIVER_SHARE_SECRET,CRON_SECRET)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Choose your path:** [Self-host this repository](#self-hosting) · [Use hosted Quiver](https://www.quivergtm.dev/) · [Contribute](CONTRIBUTING.md)

## The problem isn't another draft

Your positioning lives in one document. Customer objections are buried in call notes. Campaign work happens in a chat; published content lives somewhere else; results rarely make it back into the next brief. A capable agent can still produce the wrong work when it cannot see the decisions behind it.

Quiver gives that work a system of record. Product context has versions. Research can inform campaigns. Sessions produce artifacts you can review and revise. Published content and performance stay linked to the work that produced them. When results suggest a change in direction, the team can review a proposed context update rather than silently rewriting its source of truth.

### A concrete loop

Say you're marketing a new developer API:

1. **Set the context.** Record the product, audience, positioning, messaging, and hypotheses in onboarding. Quiver keeps versions as that context changes.
2. **Capture evidence.** Save customer research and feature the quotes worth carrying into future strategy and creation sessions.
3. **Run the campaign.** Use Strategy to plan and Create to draft content. Save the outputs as versioned artifacts linked to a campaign; move them through review before calling them live.
4. **Ship and learn.** Track content and where it was distributed, log results against the campaign or artifact, and review proposed context changes before the next round.

The web UI runs Quiver's five AI session modes. MCP clients can work with the same context, campaigns, artifacts, research, content, and performance records after initial setup in the web UI. Quiver organizes the work; it does not replace your judgment, your publishing destination, your CRM, or your analytics tools.

## What's in the self-hosted edition

| Part | What it lets you do |
|---|---|
| Product context | Keep approved positioning, ICP, messaging, evidence, and hypotheses in versioned context; review proposals and restore earlier versions. |
| Sessions & skills | Use Strategy, Create, Feedback, Analyze, or Optimize modes with skills loaded for the task and product context available to each session. |
| Campaigns & artifacts | Group sessions, research, content, artifacts, and results around an initiative. Save revisions and move artifacts through explicit statuses. |
| Customer research | Save research entries, extract and feature customer quotes, and capture signals against active hypotheses. |
| Content | Store markdown with SEO/OG metadata; track distributions and dated metric snapshots. Make *published* pieces available to your site through the [public Content API](#public-content-api). |
| Performance | Log metrics and qualitative results; review the close-the-loop queue and proposed context updates. |
| MCP | Use Quiver from an external agent with the [local stdio server or remote HTTP endpoint](#mcp-server). |

Quiver is **not** an AI copy generator with a folder bolted on. Its value is keeping the source material, the work, its state, and what happened afterward connected. It also isn't a turnkey autopublisher: the Content API makes published records available for your site to fetch and render.

## Self-hosting

This repository is the **MIT-licensed, single-team deployment**. You operate the app, database, and Anthropic account. If you'd rather have a managed, shared team workspace without maintaining the infrastructure, [use hosted Quiver](https://www.quivergtm.dev/) instead; its packaging and features are separate from this repository.

You'll need a [Supabase](https://supabase.com) project (Postgres and Auth), an [Anthropic API key](https://console.anthropic.com/settings/keys), and a Vercel project. The deploy button creates a deployment, but **you still need to configure the services and run the database migrations**.

1. Fork this repository. Create a Supabase project and collect its connection strings, project URL, and API keys.
2. Generate a share-link secret with `openssl rand -base64 32`. Set the [environment variables](#environment-variables) on your Vercel project; configure Supabase Auth for your deployment URL.
3. Use the **Deploy with Vercel** button above, or import your fork into Vercel. Set `NEXT_PUBLIC_APP_URL` to your actual deployment URL.
4. From your checked-out fork with `DATABASE_URL` and `DIRECT_URL` configured, apply the schema:
   ```bash
   npx prisma migrate deploy
   ```
5. Open the deployment, sign in, and complete onboarding to create the first product-context version.

For local development, see [CONTRIBUTING.md](CONTRIBUTING.md). Don't commit `.env.local` or expose the Supabase service-role key in client-side code.

### Environment variables

Copy [`.env.example`](.env.example) to `.env.local` for local work, or set the same keys in Vercel. The example file explains where to obtain each value.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Pooled Postgres connection string for the app. |
| `DIRECT_URL` | Yes | Direct Postgres connection for Prisma migrations. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase public/anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only service-role key. Never expose it to clients. |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for the app's AI features. |
| `NEXT_PUBLIC_APP_URL` | Yes | Your app URL, e.g. `https://your-domain.example`. |
| `QUIVER_SHARE_SECRET` | Yes | Secret for session share links; generate it yourself. |
| `MCP_AUTH_SECRET` | Yes in production | Bearer token for `/api/mcp`. Without it, that endpoint refuses every request outside local development — it exposes writes and deletes. |
| `CRON_SECRET` | Yes in production | Bearer token Vercel sends to `/api/cron/pattern-report`. Without it the job returns 200 and does nothing, so the monthly pattern report never runs. |

## Public Content API

Your site can fetch published content from Quiver as JSON, then render it however you want:

```txt
GET /api/public/content/[slug]   # one published piece, including markdown and SEO/OG fields
GET /api/public/content          # paginated list of published pieces
```

The list accepts `contentType`, `limit` (default `20`, max `50`), and `offset` (default `0`). Both endpoints are public and rate-limited to 60 requests/minute per IP, using an in-memory limiter per app instance. Drafts are not returned. See [`app/api/public/content`](app/api/public/content) for the implementation.

## MCP server

Quiver exposes its context, campaigns, artifacts, content, research, and performance as tools. Connect an MCP-compatible client to work with the same records without opening the web UI—for example, save research after a call or log campaign results from an agent that also has access to your analytics tools. Those external data pulls depend on the integrations **your client** has; Quiver does not automatically connect to them.

### Local stdio server

Build the server from the repository root:

```bash
npm install          # repository root first
cd mcp
npm install
npm run build        # runs prisma generate itself
```

Point Claude Desktop, Cursor, or another stdio MCP client at the absolute path to `mcp/dist/index.js` and supply the database connection string. Example configuration:

```json
{
  "mcpServers": {
    "quiver": {
      "command": "node",
      "args": ["/absolute/path/to/quiver/mcp/dist/index.js"],
      "env": {
        "DATABASE_URL": "your-postgres-connection-string"
      }
    }
  }
}
```

`ANTHROPIC_API_KEY` is optional for this stdio server. Without it, `log_performance` still stores results but skips AI synthesis.

### Remote HTTP endpoint

The Next.js app exposes Streamable HTTP at `https://<your-domain>/api/mcp`. **Set `MCP_AUTH_SECRET` before deploying.** Without it the endpoint refuses every request outside local development, because it exposes tools that write and delete data. Clients then send `Authorization: Bearer <your-secret>`. Treat the secret and database connection string as credentials.

The tools are grouped by context, campaigns, artifacts, performance, content, research, sessions, and workspace; see [`mcp/tools`](mcp/tools) for the exact list. `propose_context_update` queues a change for review. `apply_context_update` changes the active context immediately and creates a version: use it only when a human explicitly directs the change. MCP access is powerful; connect only clients you trust.

## How sessions use context

Each session assembles its prompt from the active product context, skills for the selected mode, and task-specific evidence. Create can include recent performance for that artifact type; Create and Strategy can include featured research quotes and recent published content. See [`lib/ai/session.ts`](lib/ai/session.ts) and [`lib/ai/skills.ts`](lib/ai/skills.ts). The pinned marketing skills live in [`/skills`](skills) with [upstream attribution](https://github.com/coreyhaines31/marketingskills); they are not fetched on every request.

## Built with

Next.js 14 · TypeScript · Tailwind CSS and shadcn/ui · Supabase/Postgres · Prisma · Anthropic SDK · Vitest · Vercel

## Contributing & license

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, tests, and adding skills; [SPEC.md](SPEC.md) for the product model. Quiver's source is [MIT licensed](LICENSE). The vendored [`skills/`](skills) directory is pinned from [marketingskills](https://github.com/coreyhaines31/marketingskills) under its own [MIT license](skills/LICENSE).
