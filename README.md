# Canvas Chat

A self-hosted chat app where the LLM drafts editable documents (Tiptap) and diagrams (Excalidraw) beside the conversation.

**Documents:** AI drafting and targeted edits, highlight-to-edit, quick actions, formatting toolbar, "/" slash menu, task lists, tables, live embedded diagrams, outline and word count, raw-Markdown view, version history with diff, restore and branch, export to Markdown/PDF/DOCX.
**Code:** CodeMirror canvas with language picker, AI edits, code quick actions (comments, logging, fix bugs, optimise, port), source-file export.
**Diagrams:** the full Excalidraw editor; AI flowcharts, sequence, class, state, ER and mind-map diagrams as editable shapes; ask AI about selected shapes; style presets (Colourful, Monochrome, Clean, Sketchy); tidy-up layout; Mermaid source view and edit; `.excalidraw` import; persisted shape library; PNG (incl. transparent), SVG (incl. dark) and `.excalidraw` export. See `docs/PRD.md` for scope, `docs/DECISIONS.md` for decisions, and `docs/VERIFICATION.md` for test results.

## Run it (Docker)

```sh
cp .env.example .env        # set OPENROUTER_API_KEY, ALLOWED_MODELS, DEFAULT_MODEL, TASK_MODEL, MOCK_LLM=0
docker compose up -d --build
# open http://127.0.0.1:3000
```

With `MOCK_LLM=1` (the default in `.env.example`) the app uses the scripted mock model and needs no API key.

## Develop

```sh
pnpm install
pnpm exec playwright install chromium   # PDF export and E2E tests
docker compose up -d postgres           # Postgres on 127.0.0.1:5433
pnpm dev                                # http://127.0.0.1:3000, runs migrations on start
```

## Test

```sh
pnpm typecheck && pnpm test                         # unit tests
pnpm test:e2e                                       # E2E against pnpm dev with MOCK_LLM=1
BASE_URL=http://127.0.0.1:3000 pnpm test:e2e        # E2E against the Compose stack (MOCK_LLM=1 in .env)
RUN_SMOKE=1 pnpm test:e2e --grep @smoke             # real model; needs OPENROUTER_API_KEY and MOCK_LLM=0
```
