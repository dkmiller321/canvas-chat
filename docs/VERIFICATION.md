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

## Stage 1 — Chat (2026-09-24)

**Commands**

| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` | 47 passed / 0 failed (adds the mock through the real `streamText`/`generateText` pipeline, abort, tool step; pure tool and export modules written ahead for later stages) |
| `pnpm test:e2e --grep "@stage[01]"` | 5 passed / 0 failed (10.2 s) |

**Playwright MCP walkthrough** (fresh DB via `POST /api/test/reset`, `MOCK_LLM=1 pnpm dev`)

- E2E-01: pass. `stop-button` was visible right after send. Sampling every 15 ms saw `""`, `Hello! I am`, `Hello! I am the mock model`, then the full sentence. The stop button was gone afterwards.
- E2E-02: pass. `code-block` text was `ts` + `const answer = 42;`. After clicking `copy-code`, the clipboard read exactly `const answer = 42;`.
- E2E-03: pass. Stopped after 800 ms: the text was 224 characters before and 224 characters one second later, and `chat-input` was enabled.
- E2E-04: pass. Selected `mock/beta` in `model-picker`; the reply was `Mock reply from mock/beta`.

**Surprises**

- None in behaviour. AI SDK v7 matches the v5-style `useChat`/`DefaultChatTransport` API closely. The mock implements `LanguageModelV4` directly rather than using `MockLanguageModelV4`, so it can look at the prompt and pace chunks itself.

## Stage 2 — Persistence (2026-09-24)

**Commands**

| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` | 47 passed / 0 failed |
| `pnpm test:e2e --grep "@stage[012]"` | 1st run: 7 passed, 1 failed (E2E-07). After the fix: 8 passed / 0 failed (9.9 s) |

**Playwright MCP walkthrough**

- E2E-05: pass. After reload at `/c/<id>`: user `["Say hello"]`, assistant `["Hello! I am the mock model and streaming works."]`, 1 `sidebar-item`.
- E2E-06: pass. 3 chats; renamed the second to "Renamed Chat"; searching `renamed` left 1 visible item (the renamed one). Deleted it; after reload 2 items remained, and `GET /api/conversations/<deleted>` returned 404.
- E2E-07: pass. A and B got different ids. Clicking A's item went to `/c/<A>` and showed only "Say hello" and the S1 reply, with 0 code blocks.
- The browser console had no errors or warnings across the walkthroughs.

**Surprises**

- E2E-07 caught a real bug. Without `generateMessageId`, `toUIMessageStreamResponse` gave replies ids that repeated across conversations. The upsert then overwrote chat A's reply with chat B's. Fixed by giving replies UUIDs, and message upserts now only update rows in their own conversation (`setWhere`).
