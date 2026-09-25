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

## Stage 3 — Document canvas (2026-09-24)

**Commands**

| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` | 47 passed / 0 failed (includes Markdown round-trip stability through the editor's own extensions, and the pure tool modules) |
| `pnpm test:e2e --grep "@stage[0-3]"` | 12 passed / 0 failed on the first run (16.9 s). 12 passed again after the autosave fix below, and again after the theme-script change. |

**Playwright MCP walkthrough** (chained E2E-08 → 09 → 10 → 11 in one session, as a user would do it)

- E2E-08: pass. An in-page MutationObserver recorded `streaming: Writing document…` → `streaming: Document created` → `idle: Document created`. `canvas-panel` opened, `doc-title` read "Coffee Guide", the `Brewing` heading was present, one `artifact-card` appeared, and the API showed v1 / `ai`.
- E2E-09: pass. After typing ` My note.`, the API showed v2 / `user` about 0.93 s later, containing `Use fresh beans. My note.`.
- E2E-10: pass. The panel was hidden after `canvas-close`; clicking the card showed "Coffee Guide" again.
- E2E-11: pass. After reload and a card click, the editor text was identical.

**Surprises**

- **Real bug found by the chained walkthrough, missed by the isolated specs:** after a manual edit, close then reopen showed the *old* text. The autosave never updated the hook's cached content, so the remounted editor loaded v1. A pending save could also run after its editor had unmounted. Fixed: content is captured synchronously when a save is flushed; saved content updates the cache (not the reset key); closing, switching and sending flush first. Re-verified via MCP: reopen shows `… My note.`, and closing with an unsaved ` Second.` still saves v3 with it.
- **Proposed spec addition (not made):** E2E-10 could type a manual edit before closing and assert that the reopened editor shows it. The current specs don't cover this path.
- Under the mock the "Writing document…" state lasts about 50 ms. The MCP server's round-trips can't sample it with separate calls, so both the spec and the walkthrough use an in-page observer.
- React warned about an inline `<script>` during a Fast Refresh reload. The theme script now uses `next/script` `beforeInteractive`, and a fresh load plus reload logs no console errors or warnings.

## Stage 4 — Document editing (2026-09-24)

**Commands**

| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` | 47 passed / 0 failed (applyEdits atomicity, ambiguity, S6–S10 logic, rewriteSelection) |
| `pnpm test:e2e --grep "@stage[0-4]"` | 1st run: 17 passed, 1 failed (E2E-13, see below). After the user-approved spec fix: 18 passed / 0 failed (31.6 s) |

**Playwright MCP walkthrough**

- E2E-12: pass. Lines went from `Coffee is a brewed drink.` to `Coffee is a beverage prepared from roasted beans.`, every other line was unchanged, and the API showed v2 / `ai`.
- E2E-13: pass. Typed ` My note.` (v2 / user), then "Add a conclusion". Editor lines: `… Use fresh beans. / Conclusion / Enjoy responsibly. My note.`, with a Conclusion heading, and the API showed v3 / `ai`.
- E2E-14: pass. `tool-status` read "Editing the document failed", with 1 version only. After the fix below it also shows the reason: `Edit 1 failed: the text "TEXT THAT DOES NOT EXIST" was not found…`.
- E2E-15: pass. Triple-click, then `ask-ai-button` → `shorten` → submit. The paragraph became `Grind beans fresh.`, other lines were unchanged, and the API showed v2 / `ai`.
- E2E-16: pass. `quick-action-formal` produced `COFFEE Guide / COFFEE is a brewed drink. …`, with no `Coffee` left, and the API showed v2 / `ai`.
- E2E-17: pass. Viewing v1 gave `contenteditable="false"`. After restore the API showed v3 / `user`, content equal to v1, and `contenteditable="true"`.

**Surprises**

- **Spec fix (approved by the user):** E2E-13 had an assertion I added beyond E2E_TESTS.md, "v3 contains `Use fresh beans. My note.`". It contradicts script S7, which inserts the conclusion between the two sentences. It now asserts v3 contains `My note.` and `## Conclusion\n\nEnjoy responsibly.`. Every documented assertion is unchanged.
- The AI SDK masks tool-error text in the UI stream ("An error occurred."). The chat route's `onError` now passes `ToolError` messages through and keeps other errors generic.
- My first E2E-16 walkthrough check passed falsely, because Playwright's `getByText` is case-insensitive. I re-checked with a case-sensitive `textContent.includes`.

## Stage 5 — Diagram canvas (2026-09-24)

**Commands**

| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` | 47 passed / 0 failed |
| `pnpm test:e2e --grep "@stage5"` | 3 passed / 0 failed on the first run |
| `pnpm test:e2e --grep "@stage[0-5]"` | 21 passed / 0 failed |

**Playwright MCP walkthrough**

- E2E-18: pass. `diagram-editor` held 2 `<canvas>` elements. The API showed a `diagram` at v1 / `ai`, text labels `User, Login, Dashboard`, and 2 arrows. A screenshot confirmed the labels sit inside their boxes and the arrows are bound.
- Extra check: opening the diagram and waiting 2.5 s does **not** autosave a spurious v2 (the version hash baseline is correct).
- E2E-19: pass. Pressing `r` and dragging created v2 / `user` about 0.9 s later, with rectangles going from 3 to 4.
- E2E-20: pass. The switcher tabs were `Coffee Guide` and `Login Flow`. Switching showed `doc-editor` (the text intact, diagram hidden) and then `diagram-editor` (doc hidden).
- No browser console errors.

**Surprises**

- None. Excalidraw 0.18's `hashElementsVersion` plus `restoreElements` gave a stable baseline, so load and AI updates don't trigger autosaves.

## Stage 6 — Diagram editing (2026-09-24)

**Commands**

| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` | 47 passed / 0 failed (applyDiagramOps: add/arrow binding/placement, relabel, remove with cascade, restyle, unknown id, hand-drawn shape kept, no input mutation) |
| `pnpm test:e2e --grep "@stage6"` | 2 passed / 0 failed on the first run |
| `pnpm test:e2e --grep "@stage[0-6]"` | 23 passed / 0 failed |

**Playwright MCP walkthrough**

- E2E-21: pass. v2 / `ai` has labels `User, Login, Dashboard, Cache`. The ids of User/Login/Dashboard are identical before and after, and the new arrow is bound from Login to Cache. A screenshot shows Cache placed below Login with the arrow attached, and no overlap.
- E2E-22: pass. The hand-drawn rectangle (v2 / user) is still present in v3 / `ai` alongside Cache.
- Extra check: after the AI update is loaded into the open canvas, no echo autosave happens (it stays at v3 after 2 s).
- No browser console errors.

**Surprises / gaps**

- G3 (freeform skeleton diagrams) is implemented (`create_diagram` with `elements`, converted with `convertToExcalidrawElements` in the browser), but no mock script or E2E scenario exercises it. Logged in KIT_FEEDBACK.md.

## Stage 7 — Export and polish (2026-09-24)

**Commands**

| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` | 48 passed / 0 failed (adds the HTML renderer: every block type, escaping, unsafe `javascript:` links dropped) |
| `pnpm test:e2e --grep "@stage7"` | 1st run: 0/5, because a compile error broke every route (see below). 2nd: 4/5 (settings link missing, see below). 3rd: 5 passed / 0 failed |
| `pnpm test:e2e` (full suite) | **28 passed / 0 failed** (56.6 s) |

**Playwright MCP walkthrough** (files saved to `test-results/mcp-exports/` and opened)

- E2E-23: pass. Downloaded `coffee-guide.md` (exact v1 Markdown), `coffee-guide.pdf` (19 KB; read back as a rendered page with the H1/H2 headings), and `coffee-guide.docx` (a valid zip; `word/document.xml` has `Heading1`/`Heading2` styles and all four text runs).
- E2E-24: pass. `login-flow.png` renders the three labelled boxes and arrows; `login-flow.svg` is an `<svg>` containing all labels; `login-flow.excalidraw` has `type: "excalidraw"` and 8 elements.
- E2E-25: pass. The sidebar showed "Mock Title" 98 ms after send.
- E2E-26: pass. After Regenerate: 1 user and 1 assistant message (S1 text). After editing the user message to "Show me code" and resending: 1 user and 1 assistant message with a code block, still true after reload.
- E2E-27: pass. Saved default `mock/beta`; `new-chat`'s `model-picker` then read `mock/beta`.
- Themes: toggling to dark persisted across reload (`localStorage.theme = "dark"`), and a screenshot showed readable dark UI.

**Surprises**

- Next 16 refuses any import of `react-dom/server` in the app bundle. My PDF HTML used `renderToStaticMarkup`, and the compile error returned 500 from **every** route, including `/api/test/reset`. Replaced it with a small renderer from the same Tiptap JSON the DOCX export uses, so both exports share one Markdown dialect.
- Several of my scripted (Python) edits silently didn't apply, because files written on Windows have CRLF endings. The sidebar settings link was missing until I found it through the E2E-27 failure. I audited every earlier scripted edit (all present) and switched to exact-match edits.
- Console, dev only: Excalidraw's font-subsetting worker can't load under Turbopack dev (`file:///ROOT/...`), so it falls back to the main thread and SVG export still works. Checked again against the production build in final acceptance. One `ERR_INCOMPLETE_CHUNKED_ENCODING` came from my walkthrough navigating away mid-stream, not from the app.

## Final acceptance (2026-09-24)

**Steps (CLAUDE.md → Final acceptance)**

| Step | Command | Result |
|---|---|---|
| 1 | `docker compose up -d --build`, then poll `/api/health` | 200 `{"status":"ok","db":"ok"}`. The app is published on `127.0.0.1:3000` only. Re-run on a fresh volume (`docker compose down -v`): the container applied migrations (5 tables) and seeded settings by itself. |
| 2 | `BASE_URL=http://127.0.0.1:3000 pnpm test:e2e` | 1st run 27 passed / 1 failed (E2E-23 PDF, see below). After the fix: **28 passed / 0 failed** (51.8 s) |
| 3 | MCP walkthrough of every scenario (all P0 plus the P1 ones) against the container | **E2E-00 … E2E-27: 28 pass / 0 fail.** Exports saved and checked: PDF `%PDF-`, 7.9 KB; DOCX a valid zip; PNG signature; SVG and `.excalidraw` valid |
| 4 | `RUN_SMOKE=1 pnpm test:e2e --grep @smoke` | **Skipped:** `OPENROUTER_API_KEY` is empty in `.env`. The 4 smoke specs list correctly and skip with that reason. |

**Totals**

- Unit (Vitest): 48 passed / 0 failed.
- E2E (mock model): 28 passed / 0 failed on `pnpm dev` and 28 / 0 on the Docker stack.
- MCP walkthroughs: every scenario passed at its stage and again against the container.
- Smoke (real model): 4 skipped (no API key).

**Fixes made during final acceptance**

- `next build` in Docker failed with "Failed to collect page data for /api/health": the DB client validated env at import time, and the build has no runtime env. The client is now created lazily on first use.
- PDF export returned an error in the container: standalone output tracing leaves out Playwright's runtime files (`browsers.json`). `outputFileTracingIncludes` didn't apply to the route, so the Dockerfile copies both Playwright packages whole.

**Known issues**

1. Excalidraw's font-subsetting worker fails to start (`file:///ROOT/...` URL from the Turbopack bundle) in both dev and production. Excalidraw falls back to the main thread, so SVG/PNG export works but is slower for large drawings.
2. The real-model path (OpenRouter) is untested here: no API key was available. Tool calling, the diagram skeleton path (G3) and title generation have only run against the mock.
3. G3 skeleton diagrams, the D9 diff view and non-scripted "Ask AI" instructions have no E2E scenario (unit tests and manual checks only).
4. Highlight-to-edit replaces the first exact occurrence of the selected Markdown (DECISIONS #13).
5. The GitHub Actions workflow has never run, because the repo has no remote (DECISIONS #7).

## Design pass (2026-09-24, after final acceptance)

User-requested visual improvements (DECISIONS #17). No test IDs or assertions changed.

| Command | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` | 52 passed / 0 failed (adds `diagram-style` tests: palette cycling, group frames, model-chosen colours kept) |
| `docker compose up -d --build` then `BASE_URL=http://127.0.0.1:3000 pnpm test:e2e` | 28 passed / 0 failed |

MCP screenshots of the rebuilt container are in `screenshots/v2-*.png`, with a PDF in `screenshots/v2-coffee-guide.pdf`. Checked visually: document typography (light and dark), Ask AI with the selection kept highlighted and the box below it, the formatted Changes view, version navigation, floating quick actions, and the diagram house style before and after "Add a cache".

Known issue: the container has no Source Serif/Inter system fonts, so the PDF export falls back to Liberation/DejaVu. It is still clean, but doesn't match the editor exactly.

## Stage 8 — Artifact essentials (2026-09-24)

| Command | Result |
|---|---|
| Tests-first baseline, `BASE_URL=… pnpm test:e2e --timeout=15000 --grep "@stage(8\|9\|1[0-5]) "` | 21 failed / 0 passed (all new specs, before any feature code) |
| `pnpm typecheck` / `pnpm test` | pass / 58 passed |
| `pnpm test:e2e --grep "@stage8 "` | 1st run 2/4 (E2E-29, E2E-31); after fixes 4/4 |
| `pnpm test:e2e --grep "@stage[0-8] "` | 32 passed / 0 failed (again after Prettier formatting) |

MCP walkthrough (real clicks; screenshots `screenshots/v11-01…06`):
- E2E-28: pass. New → Document opened "Untitled document". Typing gave v2 "Hello world" by user; the chat got a URL and a sidebar item.
- E2E-29: pass. Renamed via the pencil to "Brew Notes" (title, tab and API all updated). Delete → confirm returned 404, and the chat card now reads "Document · deleted" and is disabled.
- E2E-30: pass. Used ‹ to reach v1, then Branch: "Coffee Guide (v1 copy)" opened and is editable; its v1 equals the original v1; the original stays at v2.
- E2E-31: pass. Copy matched the saved Markdown; the Markdown view showed the source; appending "Extra line." and toggling back gave v2 by user; the word count updated to 13.

Surprises and fixes:
- Deleting the only artifact closed the panel, so E2E-29 couldn't find the switcher. The panel now stays open with an empty state, which the spec expects.
- **Spec adjustment, flagged for review:** the Windows clipboard turns `\n` into `\r\n`, so E2E-31 now compares the clipboard with line endings normalised. The scenario text is unchanged, and it would pass as written on Linux/CI.
- The outline rail was hidden at the default canvas width (the spec passed because it checks text, not visibility). The word count moved into the always-visible status line, and an Outline toggle opens the rail at any width.
- Added `.gitattributes`/`.editorconfig` (LF) and Prettier (`pnpm format`) after more CRLF and escaping problems in scripted edits. The codebase is now formatted in one style.
