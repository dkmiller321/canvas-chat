# CLAUDE.md — Canvas Chat

Read these first, in order:

1. `docs/PRD.md`: what we are building and why. It is the source of truth for scope.
2. `docs/E2E_TESTS.md`: the acceptance contract. A feature exists when its scenarios pass.
3. This file: how to work.

If this file and the PRD disagree, the PRD wins. If the PRD and E2E_TESTS.md disagree, stop and ask.

## Stack (fixed)

| Layer | Choice |
|---|---|
| Runtime | Node 22 LTS, pnpm |
| Framework | Next.js (App Router), TypeScript `strict: true` |
| LLM | Vercel AI SDK (`ai`, `@ai-sdk/react`) + `@openrouter/ai-sdk-provider` |
| UI | Tailwind CSS + shadcn/ui |
| Documents | Tiptap core (MIT extensions only) + Markdown round-trip |
| Diagrams | `@excalidraw/excalidraw` + `@excalidraw/mermaid-to-excalidraw` |
| Database | Postgres 16 + Drizzle ORM and drizzle-kit migrations |
| Validation | zod (env, API inputs, tool inputs) |
| Export | Playwright's Chromium for PDF; `docx` for DOCX |
| Tests | Vitest (unit), `@playwright/test` (E2E) |
| Deploy | Docker Compose: `app` + `postgres` |

These packages are pre-approved. **Ask before adding any other runtime dependency.** Dev-only tooling (types, lint config) is fine.

## Hard rules

- **Tests first.** Write every E2E spec in `docs/E2E_TESTS.md` before building features. Specs may fail; they may not be weakened later to pass. If a scenario is wrong, say so and propose the change. Never silently edit an assertion.
- **Nothing is done until it has run.** For every claim of "works", state the command you ran and what you observed.
- **Mock model for tests.** With `MOCK_LLM=1`, the app uses the scripted mock model described in E2E_TESTS.md. No test except `@smoke` may call a real LLM.
- **Selectors are a contract.** Use the `data-testid` values listed in E2E_TESTS.md exactly. Don't rename them.
- **No Open WebUI code.** Recreate its UX independently; its licence has a branding clause. Open Canvas (MIT) patterns are fine to borrow, with attribution in `NOTICE.md`.
- **No real-time collaboration, auth, RAG or plugins.** They are v1 non-goals.
- **No TODOs or stubs** left in committed code. Implement it, or record it as out of scope in `docs/DECISIONS.md`.
- **Secrets stay server-side.** Never expose `OPENROUTER_API_KEY` to the client bundle.

## Conventions

- `src/` layout: `app/` (routes), `components/`, `lib/` (server logic), `lib/llm/` (provider + mock), `lib/tools/` (agent tools), `db/` (schema, migrations).
- Env is read once in `src/lib/env.ts` with zod; nothing else reads `process.env`.
- Agent tools are pure functions of (input, current artifact) → new content, unit-tested in isolation. Route handlers only wire them up.
- Every artifact change writes a new row in `artifact_versions`. Never update a version in place.
- Errors propagate to one handler per route. No blanket try/catch, retry decorators or logging wrappers unless a real failure motivates them.
- Commit after each stage with the message `stage N: <summary>`.

## Workflow

Work through the stages in `docs/PRD.md` → Milestones, in order, without waiting for confirmation between stages unless you are blocked.

For each stage:

1. Implement the stage.
2. Run `pnpm typecheck && pnpm test` (unit).
3. Run `pnpm test:e2e --grep @stageN` against the dev server (`MOCK_LLM=1`). All scenarios tagged for this stage **and every earlier stage** must pass.
4. **Verify with the `playwright-headless` MCP server.** Start the app, then drive each of this stage's scenarios through the MCP tools (navigate, snapshot, click, type, and so on), following the steps in E2E_TESTS.md. This is a second, independent check that the UI behaves as the specs claim.
5. Append a section to `docs/VERIFICATION.md`: the stage, the commands run with their pass/fail counts, each MCP-walked scenario ID with its result, and anything that surprised you.
6. Commit.

Stop and ask when:

- a change would alter the PRD's scope or a test's assertion,
- a dependency outside the approved list seems necessary,
- the same failure survives three genuine fix attempts.

## Final acceptance

1. `docker compose up -d --build`, then wait for `/api/health` to return 200.
2. Run `BASE_URL=http://localhost:3000 pnpm test:e2e` against the containerised app. All non-smoke tests must pass.
3. Walk every P0 scenario through the `playwright-headless` MCP server against the containerised app.
4. If `OPENROUTER_API_KEY` is set, run `RUN_SMOKE=1 pnpm test:e2e --grep @smoke`.
5. Write the final summary in `docs/VERIFICATION.md`: totals, any skipped tests with reasons, and known issues.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
