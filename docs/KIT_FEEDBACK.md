# KIT_FEEDBACK.md — self-improvement log

A running log of issues hit while building from this kit (`CLAUDE.md`, `KICKOFF.md`, `docs/PRD.md`, `docs/E2E_TESTS.md`, `.env.example`). Each entry records what happened, what it cost, and a concrete change for the next kit. The newest entries are at the bottom of each section.

Tags: **[env]** machine/setup · **[contract]** E2E_TESTS.md · **[prd]** PRD gaps · **[process]** CLAUDE.md/KICKOFF workflow · **[stack]** library/version surprises · **[agent]** my own mistakes

## Log

### 2026-09-24 · Kickoff and stage 0

1. **[env] Preconditions weren't checked before kickoff.** Docker Desktop wasn't running, the folder wasn't a git repo (every stage ends in a commit), `git user.name` was unset, and `.env` hadn't been copied. Each one needed a question to the user.
   - *Kit change:* add a `scripts/preflight.sh` (or a KICKOFF step 0) that checks `docker ps`, `git rev-parse`, `git config user.name`, `.env` present, Node/pnpm versions and free ports, and prints fixes.

2. **[env] Port 5432 was already taken by a local Postgres install.** Compose failed to bind. I moved it to 5433 and edited `.env.example`.
   - *Kit change:* default `POSTGRES_HOST_PORT` to something uncommon (e.g. 5433 or 55432) in `.env.example` and Compose from the start, and add the port to the preflight.

3. **[process] The approved-dependency list was too narrow for the PRD.** C2 (markdown + highlighting), D2 (Markdown round-trip), D9 (diff), a Postgres driver for Drizzle, and shadcn's own deps were all missing, which forced a blocking "ask before adding" question at kickoff.
   - *Kit change:* pre-approve `postgres`, `react-markdown`, `remark-gfm`, `shiki`, `@tiptap/markdown`, `@tiptap/extension-table`, `diff`, `radix-ui`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority` in CLAUDE.md.

4. **[stack] Versions had moved past the model's training data.** The kit names packages but not versions. Installs got AI SDK v7 (LanguageModel spec **V4**), Next 16 and TypeScript 7 (the native port; I pinned `^5.9` so Next's type-check works). I had to read `.d.ts` files to learn the APIs.
   - *Kit change:* pin major versions in CLAUDE.md (e.g. `ai@7`, `next@16`, `typescript@5.9`), or ship a `package.json` skeleton with the lockfile.

5. **[contract] Tests-first baseline is slow.** 27 failing specs × 60 s timeout ≈ 27 minutes of dead time in stage 0.
   - *Kit change:* in stage 0 run only `--grep @stage0` plus `--list`, or set `timeout: 15_000` for the baseline run (`--timeout=15000`).

6. **[stack] Next 16 dev blocks `127.0.0.1` HMR origins** unless `allowedDevOrigins` is set. Playwright uses 127.0.0.1, so this is a warning plus possible flakiness.
   - *Kit change:* include `allowedDevOrigins: ["127.0.0.1"]` and `next dev -H 127.0.0.1` in the scaffold instructions.

7. **[prd] Mermaid conversion needs a DOM, but the tool contract implies the server saves version 1.** `@excalidraw/mermaid-to-excalidraw` only runs in the browser, so the browser has to save diagram v1 (DECISIONS #2).
   - *Kit change:* state this in the PRD's agent-tools table ("converted in the browser, which saves v1") so the builder doesn't have to discover it.

8. **[prd] `HOST=127.0.0.1` conflicts with running in Docker.** A server bound to 127.0.0.1 inside a container can't be reached from outside it.
   - *Kit change:* say "bind 0.0.0.0 inside the container, publish as `127.0.0.1:3000:3000`" in the PRD/CLAUDE.md.

### 2026-09-24 · Stages 1–4

9. **[stack] AI SDK: without `generateMessageId`, reply ids are not unique across conversations.** Persisting replies by id made chat B's reply overwrite chat A's. E2E-07 caught it.
   - *Kit change:* add to CLAUDE.md conventions: "pass `generateMessageId` to `toUIMessageStreamResponse`, and scope message upserts to their conversation."

10. **[contract] The isolated specs missed a real bug that a chained MCP walkthrough caught.** After a manual edit, closing and reopening the canvas showed stale text. Every spec starts from a fresh DB and never combines edit → close → reopen.
    - *Kit change:* add a scenario "manual edit, close canvas, reopen: the edit is shown" (and "close with an unsaved edit: it is still saved"). Also tell the MCP walkthrough to chain scenarios the way a user would, not only replay each spec.

11. **[contract] The mock's timing is too fast to observe with MCP round-trips.** The "Writing document…" status lasts about 50 ms, so step-by-step MCP calls never see it. I used an in-page MutationObserver instead.
    - *Kit change:* have the mock pause ~400 ms *after* the tool call as well (or stream tool input slowly), or say in E2E_TESTS §3 that transient states should be checked with an in-page observer.

12. **[agent] I added an assertion to E2E-13 that contradicted script S7** ("v3 contains `Use fresh beans. My note.`"). S7 inserts the conclusion between the two sentences, so the note moves to after "Enjoy responsibly.". It cost a failed run and a question to the user.
    - *Kit change:* when writing specs, derive any extra assertion from the mock script's exact output, and prefer checking the documented assertions only. Also, E2E_TESTS.md's note under E2E-13 ("still matches because the edit only appends after it") could say explicitly where the note ends up.

13. **[stack] The AI SDK masks tool error text in the UI stream by default** ("An error occurred."), so the user never sees why an edit failed.
    - *Kit change:* CLAUDE.md: "set `onError` on the UI stream to show tool-error messages (not other errors)."

14. **[process] The MCP sandbox has no `fetch`.** `browser_run_code_unsafe` code must use `page.request` for API calls. Also, Playwright's `getByText` is case-insensitive by default, which made a walkthrough check (`COFFEE` vs `Coffee`) pass falsely at first.
    - *Kit change:* add both to E2E_TESTS §3 (MCP walkthrough tips).

15. **[process] Stage-by-stage commits are awkward when shared UI spans stages.** The canvas panel (versions, quick actions, export menu, diagram editor) is one component, so the stage 3 commit contains code that is only verified in stages 4–7.
    - *Kit change:* either accept "stage N commit may contain later-stage code, verified later" in CLAUDE.md, or split milestones along component lines.

### 2026-09-24 · Stages 5–6

16. **[contract] Some P1 requirements have no mock script or scenario:** G3 skeleton diagrams, D9 diff view, and the "Ask AI" path for non-`shorten` instructions. They are built but only covered by unit tests and manual checks.
    - *Kit change:* add S14 `sketch a box` → `create_diagram` with `elements` (two rectangles + an arrow), plus scenarios for D9 ("Changes" shows a removal and an addition after E2E-12's edit).

17. **[contract] The MCP viewport (1280×720) is smaller than the spec viewport (1440×900).** The canvas is about 590 px wide under MCP, and drawing coordinates are proportional, so both happen to work. A fixed-coordinate drag would have diverged.
    - *Kit change:* state one viewport for both the specs and the MCP server (`--viewport-size` on the MCP server config).

18. **[process] Stages 5 and 6 passed on the first run** because the pure tool logic (`applyDiagramOps`) was unit-tested before it was wired up. That pattern worked well.
    - *Kit change:* in CLAUDE.md, have the builder write and unit-test all pure tool modules in stage 0/1, before any UI.
