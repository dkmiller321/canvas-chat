# KICKOFF.md — paste the prompt below into Claude Code

Before you start, put these files in an empty repo: `CLAUDE.md`, `KICKOFF.md`, `.env.example` and `docs/`. Then `cp .env.example .env`. Start Claude Code in the repo root and run `/mcp` to confirm the `playwright-headless` server is connected.

---

```
You are building Canvas Chat from an empty repo.

Read, in order: docs/PRD.md, docs/E2E_TESTS.md, CLAUDE.md. Follow CLAUDE.md's rules
for the whole build.

Phase 1: Plan (then continue without waiting)
- Summarise the build in under 20 lines: stages, the mock-model design, and how
  you will verify each stage with both @playwright/test and the `playwright-headless` MCP server.
- List any contradictions or gaps you found in the docs. If any block you, stop and
  ask. Otherwise record your assumptions in docs/DECISIONS.md and continue.

Phase 2: Tests first (stage 0)
- Scaffold stage 0: Next.js + TypeScript strict, Tailwind, shadcn/ui, Drizzle +
  Postgres in docker-compose.yml, zod env, /api/health, /api/test/reset, the
  mock model with all scripts S1–S13, and the Playwright config.
- Write EVERY scenario in docs/E2E_TESTS.md as a spec in e2e/, tagged by stage,
  plus the @smoke specs. Use the data-testid contract exactly.
- Run `pnpm test:e2e --list` to prove they all compile, then run the suite.
  E2E-00 must pass; everything else is expected to fail at this point.
- Confirm the `playwright-headless` MCP server works: navigate to the running app and take
  a snapshot. Record the result in docs/VERIFICATION.md. Commit.

Phase 3: Build stages 1–7
- For each stage, follow the Workflow in CLAUDE.md: implement, unit tests,
  that stage's and all earlier stages' E2E specs green, then a `playwright-headless`
  MCP walkthrough of that stage's scenarios, then VERIFICATION.md, then commit.
- Never weaken an assertion to make it pass. Propose spec changes instead.

Phase 4: Final acceptance
- Run the Final acceptance steps in CLAUDE.md against the Docker Compose stack.
- Finish with a short report: pass/fail totals, anything skipped and why, known
  issues, and the exact commands I need to run the app myself.
```

---

## Useful follow-up prompts

- **Resume after a break:** `Read CLAUDE.md and docs/VERIFICATION.md, find the last completed stage, and continue from the next one.`
- **Re-verify:** `Reset the DB and walk E2E-13 and E2E-21 through the playwright-headless MCP server; report each step.`
- **Real model:** `Set MOCK_LLM=0, then run RUN_SMOKE=1 pnpm test:e2e --grep @smoke and report results.`
