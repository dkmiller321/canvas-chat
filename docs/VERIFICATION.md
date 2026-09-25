# VERIFICATION.md

Claude Code appends one section per stage: commands run with pass/fail counts, each Playwright-MCP-walked scenario (`E2E-xx: pass | fail — note`), and surprises. Final acceptance results go at the end.

## Stage 0 — Skeleton (2026-09-24)

**Commands**

| Command | Result |
|---|---|
| `pnpm typecheck` | pass (0 errors) |
| `pnpm test` | 21 passed / 0 failed (env parsing, mock scripts S1–S13, chunking, prompt-format round-trips) |
| `pnpm test:e2e --list` | 28 non-smoke specs listed in 8 files; `RUN_SMOKE=1 … --grep @smoke --list` lists 4 smoke specs |
| `pnpm test:e2e --grep @stage0` | 1 passed |
| `pnpm test:e2e` (full suite, tests-first baseline) | 1 passed (E2E-00), 27 failed as expected. Each failure times out waiting for UI that later stages build. Total run time 27.4 min. |

**Playwright MCP (`playwright-headless`)**

- Started `MOCK_LLM=1 pnpm dev`. `GET /api/health` returned `{"status":"ok","db":"ok"}` and `POST /api/test/reset` returned 200.
- `browser_navigate http://127.0.0.1:3000/`, then `browser_snapshot`: complementary › button "New chat"; main › textbox "Message". Page title "Canvas Chat".
- E2E-00: pass — the MCP server connects and snapshots the running app.

**Surprises**

- A locally installed Postgres already holds port 5432, so Compose publishes Postgres on 5433 (DECISIONS #10).
- Next 16 dev blocks HMR requests from `127.0.0.1` unless it is listed in `allowedDevOrigins`. It is now listed, and `pnpm dev` binds to 127.0.0.1.
- The only browser console error was a 404 for `/favicon.ico`, fixed by adding `src/app/icon.svg`.
- A failing spec burns its full 60 s timeout, so a tests-first baseline of the whole suite takes about half an hour.
