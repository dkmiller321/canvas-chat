# Canvas Chat

A self-hosted chat app where the LLM drafts editable documents (Tiptap) and diagrams (Excalidraw) beside the conversation. See `docs/PRD.md` for scope, `docs/DECISIONS.md` for decisions, and `docs/VERIFICATION.md` for test results.

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
