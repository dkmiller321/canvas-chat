# DECISIONS.md

Record decisions not covered by the PRD, and anything deliberately left out of scope, one dated entry each.

## 2026-09-24 — Kickoff assumptions

1. **Docker networking vs `HOST=127.0.0.1`.** A server bound to 127.0.0.1 *inside* a container cannot be reached from the host. In Compose the app binds `0.0.0.0` inside the container and the port is published as `127.0.0.1:3000:3000`, so the host-facing exposure is still localhost-only (PRD Security). `pnpm dev` on the host uses `HOST` as-is. Postgres is published on `127.0.0.1:5432` for host-side dev and tests.
2. **Mermaid conversion runs in the browser (PRD G2 / create_diagram).** `@excalidraw/mermaid-to-excalidraw` needs a DOM. The `create_diagram` tool validates input and creates the artifact row server-side; the client converts Mermaid to Excalidraw elements and saves version 1 with author `ai` through the API. Until that happens the tool result carries the Mermaid source, so a reload before conversion re-runs it. Consequence: a diagram's version 1 needs a browser to have opened it. This is fine for a single-user local app and the tests always drive a browser.
3. **`update_diagram` runs server-side** on the stored scene JSON (add/remove/relabel/restyle by element id). New elements are written as full Excalidraw elements with deterministic positions, so no DOM is needed.
4. **Quick actions (S10).** Quick actions go through `rewrite_selection`. With no selection, the whole document body is the selection. That matches S10, where the entire body is replaced.
5. **Model context (A5).** The current artifact is read from the DB on every request (not from client state), so manual edits autosaved before sending are always included. Before sending a message, the client flushes any pending autosave.
6. **Mock model ids.** In mock mode an empty `ALLOWED_MODELS` falls back to `mock/alpha,mock/beta`, with `DEFAULT_MODEL` and `TASK_MODEL` set to `mock/alpha` (as `.env.example` says). E2E-04 and E2E-27 select `mock/beta`.
7. **CI.** "CI running tests" (Stage 0) is a GitHub Actions workflow in `.github/workflows/ci.yml` that runs typecheck, unit tests and the mock E2E suite against a Postgres service container. No remote is configured yet, so it has not run in CI. It is exercised locally only.
8. **Out of scope for v1 (PRD P2):** C8 attachments, D7 custom quick actions, D8 code artifacts, E4 diagram-in-document embed, G6 selection-scoped diagram requests, U-3 multi-user.
9. **Extra runtime dependencies (approved by the user 2026-09-24):** `postgres`, `react-markdown`, `remark-gfm`, `shiki`, `@tiptap/markdown`, `diff`, plus shadcn's own dependencies `radix-ui`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`.
10. **Postgres host port 5433.** This machine already runs a local Postgres on 5432, so Compose publishes its Postgres on `127.0.0.1:${POSTGRES_HOST_PORT:-5433}` and `.env.example`'s `DATABASE_URL` points at 5433. Inside Compose the app still uses `postgres:5432`.
11. **`@tiptap/extension-table`** is added for D2 tables. It is a Tiptap core (MIT) extension, covered by the approved "Tiptap core" entry.
