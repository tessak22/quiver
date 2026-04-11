# Contributing to Quiver

## Local Dev Setup

```bash
# 1. Clone the repo
git clone https://github.com/tessak22/quiver.git
cd quiver

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env.local
# Fill in all values — see README.md for where to find each one

# 4. Create a Supabase project and add the connection strings to .env.local

# 5. Run Prisma migration
npx prisma migrate dev

# 6. Start the dev server
npm run dev
```

The app runs at `http://localhost:3000`. On first visit, the onboarding wizard starts automatically.

---

## Branch Naming

- `feature/short-description` — new functionality
- `fix/short-description` — bug fixes
- `docs/short-description` — documentation changes

Branch from `main`. Keep branches short-lived.

---

## Adding a New Marketing Skill

Skills live in the `/skills` directory and come from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills). To add a new skill to Quiver:

1. Add the skill directory to `/skills/[skill-name]/SKILL.md`
2. Register it in `lib/ai/skills.ts`:
   - Add it to the `MODE_SKILLS` map (for a session mode), or
   - Add it to the `ARTIFACT_TYPE_SKILLS` map (for a specific artifact type in create mode)
3. Add a test case in `__tests__/skills.test.ts` to verify the skill loads correctly
4. Update `PINNED_VERSION` if you pulled from the upstream repo

---

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode during development
npm run test:watch
```

Tests use Vitest. Test files live in `__tests__/`.

---

## PR Checklist

Before opening a pull request, verify:

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `npm run build` completes successfully
- [ ] `npm test` passes
- [ ] No `any` types introduced
- [ ] No `// @ts-ignore` or `// @ts-expect-error` added
- [ ] All API routes have explicit error handling (no bare 500s)
- [ ] New UI components use shadcn/ui primitives
- [ ] Client components have `'use client'` at the top with a comment explaining why

---

## Code Style

- **TypeScript strict mode** throughout. The `tsconfig.json` enforces `strict: true`, `noUnusedLocals`, and `noUnusedParameters`.
- **No `any` types.** Use `unknown` and narrow with type guards.
- **No `@ts-ignore`.** Fix the type issue instead.
- **Every API route** must return structured error responses. Never let a route return a 500 with no body.
- **Every `lib/ai/` file** opens with a comment block explaining: what it does, what it reads from, what it produces, and edge cases.
- **Server components by default.** Only add `'use client'` when interactivity requires it.
- **Prisma for all database access.** No raw SQL except in documented edge cases.
- **Dates** displayed with `Intl.DateTimeFormat`. No raw `Date.toString()`.
- **Numbers** (monetary values, percentages) formatted with `toFixed()` or `Intl.NumberFormat`. No raw float display.
