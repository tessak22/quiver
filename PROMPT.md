# Quiver — Claude Code Kick-off Prompt

Paste this as your first message when starting Quiver in a new Polyscope workspace.
This prompt is written for Autopilot. Decisions are pre-made. Read everything before starting.

---

## What you are building

You are building **Quiver** — an open source, self-hosted, AI-powered marketing command center for product teams. The full spec is in `SPEC.md` at the root of this repo. Read it completely before writing a single line of code.

Quiver is a context machine. Every AI session starts with a complete, structured understanding of the team's product positioning, ICP, competitive landscape, past campaigns, and what has worked. The AI outputs are grounded in real history, not generic best practices. The system compounds: every result logged makes the next session smarter.

**Repo:** `github.com/tessak22/quiver`
**License:** MIT
**Deploy target:** Vercel
**This is open source.** Write code as if other teams will read, fork, and deploy it.

---

## Tech stack — all decisions final, do not deviate

| Layer | Decision |
|---|---|
| Framework | Next.js 14, App Router |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Database | Supabase (Postgres) |
| ORM | Prisma |
| Auth | Supabase Auth |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) — claude-sonnet-4-20250514 |
| Skills | Markdown files from `coreyhaines31/marketingskills`, pinned at a specific commit, stored in `/skills` directory |
| Deployment | Vercel |
| Language | TypeScript strict mode throughout |

Do not introduce additional dependencies without a clear reason. If you need a library not listed here, use the most widely adopted option and leave a comment explaining why it was added.

---

## Folder structure

Scaffold exactly this structure. Do not invent new top-level directories.

```
quiver/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── invite/
│   ├── (onboarding)/
│   │   └── setup/
│   ├── (app)/
│   │   ├── dashboard/
│   │   ├── sessions/
│   │   │   ├── [id]/
│   │   │   └── new/
│   │   ├── artifacts/
│   │   │   └── [id]/
│   │   ├── campaigns/
│   │   │   └── [id]/
│   │   ├── context/
│   │   ├── performance/
│   │   └── settings/
│   └── api/
│       ├── sessions/
│       ├── artifacts/
│       ├── campaigns/
│       ├── context/
│       ├── performance/
│       └── team/
├── components/
│   ├── ui/          ← shadcn components only
│   ├── sessions/
│   ├── artifacts/
│   ├── campaigns/
│   ├── context/
│   ├── performance/
│   └── shared/
├── lib/
│   ├── ai/
│   │   ├── client.ts         ← Anthropic SDK wrapper
│   │   ├── session.ts        ← session prompt assembly
│   │   ├── synthesis.ts      ← feedback synthesis + context proposals
│   │   └── skills.ts         ← skill file loading + injection
│   ├── db/
│   │   ├── context.ts
│   │   ├── sessions.ts
│   │   ├── artifacts.ts
│   │   ├── campaigns.ts
│   │   └── performance.ts
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── utils.ts
├── skills/                   ← pinned copy of coreyhaines31/marketingskills
│   └── [skill files]
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── types/
│   └── index.ts
├── .env.example
├── SPEC.md
├── PROMPT.md
└── README.md
```

---

## Database schema — implement exactly as specced

Six tables. Implement all of them in the initial Prisma schema migration. Do not split across multiple migrations.

```prisma
// context_versions — the living product marketing context
model ContextVersion {
  id                    String   @id @default(uuid())
  version               Int
  isActive              Boolean  @default(false)
  positioningStatement  String?
  icpDefinition         Json?
  messagingPillars      Json?
  competitiveLandscape  Json?
  customerLanguage      Json?
  proofPoints           Json?
  activeHypotheses      Json?
  brandVoice            String?
  wordsToUse            String[]
  wordsToAvoid          String[]
  updatedBy             String?
  updateSource          String?  // manual | ai_proposed | feedback_session
  changeSummary         String?
  createdAt             DateTime @default(now())

  sessions     Session[]
  artifacts    Artifact[]
  campaigns    Campaign[]
}

// campaigns — top-level initiative grouping
model Campaign {
  id                  String   @id @default(uuid())
  name                String
  description         String?
  goal                String?
  channels            String[]
  status              String   @default("planning") // planning|active|paused|complete|archived
  priority            String   @default("medium")   // high|medium|low
  startDate           DateTime?
  endDate             DateTime?
  ownerId             String?
  contextVersionId    String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  contextVersion  ContextVersion? @relation(fields: [contextVersionId], references: [id])
  sessions        Session[]
  artifacts       Artifact[]
  performanceLogs PerformanceLog[]
}

// sessions — every AI conversation
model Session {
  id               String   @id @default(uuid())
  title            String?
  mode             String   // strategy|create|feedback|analyze|optimize
  skillsLoaded     String[]
  messages         Json     @default("[]") // [{role, content, timestamp}]
  campaignId       String?
  contextVersionId String?
  createdBy        String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  isArchived       Boolean  @default(false)

  campaign       Campaign?       @relation(fields: [campaignId], references: [id])
  contextVersion ContextVersion? @relation(fields: [contextVersionId], references: [id])
  artifacts      Artifact[]
}

// artifacts — every piece of work produced
model Artifact {
  id               String   @id @default(uuid())
  title            String
  type             String   // copywriting|email_sequence|cold_email|social_content|
                            // launch_strategy|content_strategy|positioning|messaging|
                            // ad_creative|competitor_analysis|seo|cro|ab_test|
                            // landing_page|one_pager|other
  content          String   // Markdown
  status           String   @default("draft") // draft|review|approved|live|archived
  skillUsed        String?
  campaignId       String
  sessionId        String?
  contextVersionId String?
  version          Int      @default(1)
  parentArtifactId String?
  tags             String[]
  createdBy        String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  campaign        Campaign        @relation(fields: [campaignId], references: [id])
  session         Session?        @relation(fields: [sessionId], references: [id])
  contextVersion  ContextVersion? @relation(fields: [contextVersionId], references: [id])
  performanceLogs PerformanceLog[]
}

// performance_logs — results per artifact and campaign
model PerformanceLog {
  id                    String   @id @default(uuid())
  artifactId            String?
  campaignId            String
  logType               String   // artifact|campaign|channel|audience_segment
  metrics               Json?    // freeform key-value: {opens, replies, clicks, etc.}
  qualitativeNotes      String?
  whatWorked            String?
  whatDidnt             String?
  proposedContextUpdates Json?   // [{field, current, proposed, rationale}]
  contextUpdateStatus   String   @default("na") // pending|approved|rejected|na
  recordedBy            String
  recordedAt            DateTime @default(now())
  periodStart           DateTime?
  periodEnd             DateTime?

  artifact  Artifact? @relation(fields: [artifactId], references: [id])
  campaign  Campaign  @relation(fields: [campaignId], references: [id])
}

// team_members — extends Supabase Auth
model TeamMember {
  id        String   @id  // matches Supabase Auth user ID
  name      String
  email     String   @unique
  role      String   @default("member") // admin|member|viewer
  createdAt DateTime @default(now())
}
```

---

## Environment variables — implement exactly these, no more

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
NEXTAUTH_SECRET=
NEXT_PUBLIC_APP_URL=
```

Ship a complete `.env.example` with every variable documented inline. A new deployer should be able to read `.env.example` and know exactly where to get each value.

---

## The skills layer — this is critical, read carefully

The `coreyhaines31/marketingskills` repo contains markdown skill files that define frameworks for every marketing task. These are the intelligence layer of Quiver.

**How skills are stored:**
Clone the skills repo and copy the `/skills` directory into this repo at `/skills`. Pin the commit hash in a file at `/skills/PINNED_VERSION` (just the commit hash, one line). Skills are static files shipped with the app — they are not fetched at runtime.

**How skills are loaded per session:**
`lib/ai/skills.ts` exports a `loadSkills(skillNames: string[])` function that reads the relevant `.md` files from `/skills` and returns their content as a concatenated string. This string is injected into the system prompt for that session.

**Skill to mode mapping — load these automatically:**

| Mode | Skills to load |
|---|---|
| strategy | `vbf-messaging`, `marketing-psychology`, `marketing-ideas`, `launch-strategy`, `competitor-alternatives` |
| create | Determined by artifact type declared at session start. Map: `copywriting` → copywriting, `email_sequence` → email-sequence, `cold_email` → cold-email, `social_content` → social-content, `ad_creative` → ad-creative, `landing_page` → copywriting + page-cro, `one_pager` → sales-enablement, `positioning` → vbf-messaging, `messaging` → vbf-messaging, `content_strategy` → content-strategy, `ab_test` → ab-test-setup, all others → copywriting |
| feedback | `customer-research` |
| analyze | `analytics-tracking`, `ab-test-setup` |
| optimize | `page-cro`, `copy-editing`, `ab-test-setup`, `signup-flow-cro`, `onboarding-cro` |

**Skill update flow (admin only):**
A settings page action lets an admin pull the latest skills. It runs a server action that fetches the latest commit from `coreyhaines31/marketingskills`, copies the `/skills` directory, and updates `/skills/PINNED_VERSION`. This is a manual admin action, not automatic.

---

## System prompt assembly — implement in `lib/ai/session.ts`

Every session system prompt is assembled in this exact order:

```
1. ROLE
   "You are an expert B2B marketing strategist. You are working inside Quiver,
   a marketing command center for [workspace product name]. Your responses are
   grounded in the team's actual product context, history, and positioning —
   not generic marketing advice. Be direct, specific, and always connect
   recommendations back to the product context you've been given."

2. PRODUCT CONTEXT (from active context_version row)
   Format each section clearly:
   ## Product
   ## Target audience & ICP
   ## Positioning
   ## Messaging pillars
   ## Competitive landscape
   ## Customer language
   ## Brand voice
   ## Words to use / avoid

3. SKILL FRAMEWORKS (from loadSkills())
   Each skill file injected with a header:
   ## Skill: [skill name]
   [full skill content]

4. PERFORMANCE HISTORY (relevant past artifacts)
   When mode is 'create': fetch the 5 most recent artifacts of the same type
   with their performance log summaries. Format as:
   ## Past work — [artifact type]
   [title] | [status] | [performance signal if logged]

5. SESSION MODE INSTRUCTIONS
   Mode-specific instructions for outputs and format.
   Strategy: "Produce structured strategic recommendations. When you arrive at
   a recommendation, state which framework from your loaded skills informed it."
   Create: "Produce complete, production-ready marketing copy. End every
   response with a prompt: 'Save this as an artifact?' so the user can
   one-click save."
   Feedback: "Synthesize the input provided. Always end with: (1) a bulleted
   summary of what worked, (2) what didn't, (3) numbered proposed updates to
   the product marketing context with current value and proposed value shown."
   Analyze: "Interpret data against the product context. Connect findings to
   specific ICP segments and channels. End with actionable next steps."
   Optimize: "Critique against the product's actual positioning and ICP.
   Produce an annotated critique followed by a revised version."

6. OUTPUT INSTRUCTIONS
   "When you produce a complete piece of work (copy, strategy, analysis),
   end your response with:
   ---
   [ARTIFACT READY — type: {type} | suggested title: {title}]
   This signals to the UI to show the one-click artifact save button."
```

---

## Streaming — implement correctly from the start

AI sessions use streaming responses. Do not use non-streaming API calls for sessions.

```typescript
// app/api/sessions/stream/route.ts pattern
const stream = await anthropic.messages.stream({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
  system: assembledSystemPrompt,
  messages: sessionMessages,
});

// Stream to client using ReadableStream
// Parse [ARTIFACT READY] marker from the stream
// When detected, emit a special event to trigger the save UI
```

Detect the `[ARTIFACT READY — type: ... | suggested title: ...]` marker as it streams. When detected, emit a `artifact_ready` event to the client with the parsed type and title. The UI shows the save button without requiring the user to scroll to the end.

---

## Onboarding flow — gate the entire app behind this

On first run (no active `context_version` row exists), redirect all routes to `/setup`. The onboarding wizard must be completed before any other part of the app is accessible.

Six steps. Each step uses an AI-assisted input — the user provides rough notes and the AI structures them using the `product-marketing-context` skill framework:

```
Step 1 — Product basics
  Fields: product name, one-liner, product category, business model
  AI assist: "Here's a draft one-liner based on what you described: [...]
  Does this capture it?"

Step 2 — Target audience
  Fields: ICP definition, decision-maker description, primary use case,
  jobs to be done (freeform, AI structures into array)
  AI assist: Structures freeform input into clean ICP definition

Step 3 — Positioning
  Fields: core problem, why alternatives fall short, key differentiators
  AI assist: Drafts a positioning statement from the inputs

Step 4 — Messaging
  Fields: value pillars (freeform), customer language (paste in verbatims),
  words to use, words to avoid
  AI assist: Structures into VBF messaging pillars

Step 5 — Competitive landscape
  Fields: add up to 5 competitors with name + positioning notes
  (can be sparse — "we don't know much yet" is fine)
  AI assist: none, just structured input

Step 6 — Team setup
  Fields: confirm admin account, invite teammates by email (optional at setup)
  Action: creates the first context_version row marked isActive: true
  Redirects to dashboard on complete
```

Each step saves progress to localStorage so a browser refresh doesn't lose work. The final submission creates the `context_version` row in one transaction.

---

## Approval gates — what requires a pause

Because this is running in Autopilot, approval gates are narrow and specific. Everything else: build and narrate.

**Pause and wait for explicit approval before:**
1. The initial GitHub issues list — show the full list, wait for go-ahead
2. The initial Prisma schema migration — show the full schema, wait for go-ahead
3. Any change to the Prisma schema after the initial migration
4. Any change to the system prompt assembly logic in `lib/ai/session.ts`
5. Any change to the skill-to-mode mapping table

**Do not pause for:**
- Scaffolding the project structure
- Building UI components
- Building API routes
- Writing lib utilities
- Writing types
- Installing dependencies from the approved stack
- Creating individual GitHub issues after the list is approved
- Fixing bugs you discover during development

---

## GitHub issues — already created

All 24 issues have been pre-created at `github.com/tessak22/quiver/issues` with the following labels: `infrastructure`, `auth`, `onboarding`, `context`, `sessions`, `artifacts`, `campaigns`, `performance`, `ui`, `dx`.

Work through them in issue number order (#1 through #24). Each issue has full acceptance criteria — use them as your definition of done.

---

## Code quality standards

- TypeScript strict mode. No `any`. No `// @ts-ignore`.
- Every `lib/ai/` file opens with a comment block explaining: what it does, what it reads from, what it produces, and any important edge cases.
- Every API route has explicit error handling. Never return a 500 with no body.
- Prisma for all database access. No raw SQL except in documented edge cases.
- All streaming routes use `ReadableStream`. No polling.
- shadcn components for all UI primitives. No custom button/input/dialog components.
- Server components by default. Client components only where interactivity requires it (`'use client'` at the top, comment explaining why).
- All monetary values and percentages in metric displays go through `toFixed()` or `Intl.NumberFormat`. No raw float display.
- Dates displayed using `Intl.DateTimeFormat` with explicit locale. No raw `Date.toString()`.
- Empty states on every list/library view. A new workspace with no data should look intentional, not broken.
- Loading states on every async action. No UI that hangs silently.

---

## What success looks like

When Quiver is done, a product team should be able to:

1. Fork the repo, add env vars, deploy to Vercel, and have a working marketing command center in under 30 minutes
2. Complete the onboarding wizard and have a structured, AI-ready product marketing context in under 20 minutes
3. Start a Strategy session and receive recommendations that are specifically grounded in their product's positioning and ICP — not generic marketing advice
4. Save an artifact from any session in one click with pre-populated metadata
5. Log performance results and see AI-proposed updates to their product context
6. Invite teammates and have them immediately working in the same shared context
7. Read the README and understand exactly how to contribute a new skill or improve the system prompt

That is the bar. Do not ship anything that doesn't meet it.

---

## Before you write a single line of code

1. Read `SPEC.md` completely
2. Read this prompt completely
3. Confirm you have no ambiguities — if something is unclear, ask now
4. The GitHub issues list is already created — start at #1 and work through in order

The spec has every decision made. If you find yourself making a judgment call that isn't covered here or in the spec, stop and flag it rather than deciding unilaterally.

Let's build it.
