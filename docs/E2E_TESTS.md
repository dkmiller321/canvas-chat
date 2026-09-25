# E2E_TESTS.md — Acceptance contract

Every scenario below becomes a `@playwright/test` spec in `e2e/` **before** the feature is built. A stage is done when its scenarios, and every earlier stage's scenarios, pass. After that, you walk them again by hand through the `playwright-headless` MCP server.

## 1. Test harness

### 1.1 Running

| Command | What it does |
|---|---|
| `pnpm test:e2e` | Runs all specs except `@smoke`. Playwright's `webServer` starts `pnpm dev` with `MOCK_LLM=1` unless `BASE_URL` is set. |
| `pnpm test:e2e --grep @stage3` | Runs one stage's scenarios. |
| `BASE_URL=http://localhost:3000 pnpm test:e2e` | Runs against an already-running app, such as the Docker Compose stack. |
| `RUN_SMOKE=1 pnpm test:e2e --grep @smoke` | Runs the real-model smoke suite. Needs `OPENROUTER_API_KEY`. |

The Playwright config uses Chromium only, headless, `workers: 1` (the tests share one database), with a trace on the first retry. Tags go in test titles, for example `test('E2E-03 @stage1 stop button halts stream', …)`.

### 1.2 Database reset

When `MOCK_LLM=1`, the app exposes `POST /api/test/reset`, which truncates `conversations`, `messages`, `artifacts` and `artifact_versions` and restores the default `settings`. The route returns **404 when `MOCK_LLM` is not `1`**. Every spec calls it in `beforeEach`.

### 1.3 The mock model

When `MOCK_LLM=1`, `src/lib/llm/provider.ts` returns a mock `LanguageModel` instead of OpenRouter. It must speak the AI SDK's streaming protocol, so the real `streamText` pipeline, tool execution, persistence and UI all run unchanged. Build it with the AI SDK's test utilities (`ai/test`) or a small custom provider.

**Matching:** the mock looks at the **last user message**, lower-cased, and picks the first script whose trigger phrase it contains. For selection edits and quick actions it matches on the instruction instead. With no match, it replies with the text `Mock: no script for this prompt.`

**Streaming:** text is emitted in chunks of 3 words, 40 ms apart, unless a script says otherwise.

**Tool calls:** the mock emits the tool call, the real tool executes against the database, then the mock emits any follow-up text. Pause 400 ms before each tool call so the "working" status is observable.

| Script | Trigger (contains) | Mock output |
|---|---|---|
| S1 hello | `say hello` | Text: `Hello! I am the mock model and streaming works.` |
| S2 long | `write a long story` | 200 repetitions of `word ` at 50 ms per chunk (about 3 s total) |
| S3 code | `show me code` | Text: `Here is code:` then a fenced block of language `ts` containing `const answer = 42;` |
| S4 model | `which model` | Text: `Mock reply from <model id>`, using the conversation's selected model id |
| S5 doc | `write a document about coffee` | Tool `create_document` with `{ title: "Coffee Guide", markdown: "# Coffee Guide\n\nCoffee is a brewed drink.\n\n## Brewing\n\nUse fresh beans." }`, then text `I drafted the Coffee Guide.` |
| S6 formal | `make it more formal` | Tool `edit_document` on the open artifact with `[{ find: "Coffee is a brewed drink.", replace: "Coffee is a beverage prepared from roasted beans." }]`, then text `Done.` |
| S7 conclusion | `add a conclusion` | Tool `edit_document` with `[{ find: "Use fresh beans.", replace: "Use fresh beans.\n\n## Conclusion\n\nEnjoy responsibly." }]` |
| S8 bad edit | `break the edit` | Tool `edit_document` with `[{ find: "TEXT THAT DOES NOT EXIST", replace: "x" }]`. The tool must fail and the document must stay unchanged. |
| S9 shorten (selection) | instruction `shorten` | Tool `rewrite_selection` whose replacement text is `Grind beans fresh.` |
| S10 quick action | instruction `quick:formal` | Replacement for the whole document body: Markdown identical to the current document except `Coffee` → `COFFEE` everywhere (deterministic and easy to assert) |
| S11 diagram | `draw a login flowchart` | Tool `create_diagram` with `{ title: "Login Flow", mermaid: "flowchart LR\n  A[User] --> B[Login]\n  B --> C[Dashboard]" }` |
| S12 add cache | `add a cache` | Tool `update_diagram` adding a rectangle labelled `Cache` and an arrow from `Login` to `Cache` |
| S13 title | (task model, title generation) | Always returns the title `Mock Title` |

### 1.4 Inspecting artifacts

Excalidraw draws to a `<canvas>`, so tests can't read its text. Assert diagram content through the API:

- `GET /api/conversations/:id` returns the conversation with messages and artifact summaries.
- `GET /api/artifacts/:id` returns `{ id, kind, title, currentVersion: { versionNo, author, content } }`.
- `GET /api/artifacts/:id/versions` returns every version, oldest first.

For diagrams, `content` is the Excalidraw scene JSON. Labels are found in `text` elements, or in the `label` of skeleton elements before conversion. Tests use a helper, `sceneLabels(content): string[]`.

### 1.5 Selector contract (`data-testid`)

| testid | Element |
|---|---|
| `chat-input` | Message textarea |
| `send-button` | Send |
| `stop-button` | Visible only while streaming |
| `message-user` / `message-assistant` | Each message bubble (multiple) |
| `tool-status` | Inline tool activity line in the assistant message |
| `code-block` / `copy-code` | Rendered code block and its copy button |
| `model-picker` | Model select for the current conversation |
| `new-chat` | New conversation button |
| `sidebar-item` | Conversation entry (multiple); has `data-conversation-id` |
| `sidebar-search` | Title filter input |
| `rename-chat` / `delete-chat` | Per-item actions (in an item menu is fine) |
| `canvas-panel` | Right-hand panel container |
| `canvas-close` | Collapse the panel |
| `artifact-card` | Card in the chat for an artifact; has `data-artifact-id` |
| `artifact-switcher` | Tabs or select between artifacts in the conversation |
| `doc-editor` | Tiptap contenteditable root |
| `doc-title` | Document title display |
| `ask-ai-button` / `ask-ai-input` / `ask-ai-submit` | Floating selection toolbar |
| `quick-actions` / `quick-action-formal` | Quick actions menu and the "formal" action |
| `diagram-editor` | Excalidraw container |
| `version-switcher` | Version list or select; options carry `data-version-no` |
| `version-restore` | Restore the viewed version |
| `export-menu` | Export dropdown |
| `export-md` / `export-pdf` / `export-docx` / `export-png` / `export-svg` / `export-excalidraw` | Export actions |
| `settings-link` / `settings-default-model` / `settings-save` | Settings page |

## 2. Scenarios

Each scenario starts from a reset database at `/` unless stated otherwise. "Send X" means typing X into `chat-input` and clicking `send-button`.

### Stage 0 — Skeleton

**E2E-00 @stage0 app boots.** `GET /api/health` returns 200 with `{ status: "ok", db: "ok" }`. Visiting `/` shows `chat-input` and `new-chat`. `POST /api/test/reset` returns 200.

### Stage 1 — Chat

**E2E-01 @stage1 streaming reply (C1, U1).** Send `Say hello`. `stop-button` becomes visible. Within 5 s, `message-assistant` contains `Hello! I am the mock model` and, while streaming, is observed at least once with partial text (a length shorter than the final text). When the stream finishes, `stop-button` is hidden and the full sentence is shown.

**E2E-02 @stage1 markdown and code (C2).** Send `Show me code`. A `code-block` contains `const answer = 42;`. Clicking `copy-code` puts `const answer = 42;` on the clipboard (grant `clipboard-read` in the test context).

**E2E-03 @stage1 stop (C1).** Send `Write a long story`. After 800 ms, click `stop-button`. Record the assistant text length, wait 1 s, and assert it hasn't grown. `chat-input` is enabled again.

**E2E-04 @stage1 model picker (C4).** Select a model other than the default in `model-picker` (the list comes from `ALLOWED_MODELS`). Send `Which model`. The reply contains that model id.

### Stage 2 — Persistence

**E2E-05 @stage2 history survives reload (C3, U2).** Send `Say hello`, then wait for the reply. Reload the page. Both messages are still shown, and one `sidebar-item` exists.

**E2E-06 @stage2 sidebar management (C3).** Create three chats by sending `Say hello` after clicking `new-chat` each time. Three `sidebar-item`s exist. Rename the second to `Renamed Chat`. Typing `renamed` in `sidebar-search` leaves exactly one item visible. Delete it. After a reload, two items remain and `GET /api/conversations/:id` for the deleted one returns 404.

**E2E-07 @stage2 switching chats (U2).** In chat A, send `Say hello`. In a new chat B, send `Show me code`. Clicking A's `sidebar-item` shows only A's messages, and the URL contains A's id.

### Stage 3 — Document canvas

**E2E-08 @stage3 create document (D1, D3, U3, C7).** Send `Write a document about coffee`. `tool-status` is visible during the tool call. `canvas-panel` opens. `doc-title` shows `Coffee Guide`. `doc-editor` contains a heading `Brewing` and the text `Use fresh beans.` An `artifact-card` appears in the chat. The API shows version 1 with author `ai`.

**E2E-09 @stage3 manual edit saves a version (A2).** After E2E-08's setup, click at the end of `Use fresh beans.` in `doc-editor` and type ` My note.`. Within 3 s of stopping typing (autosave debounce), the API shows version 2, author `user`, whose content contains `Use fresh beans. My note.`

**E2E-10 @stage3 artifact card reopens (A4).** After creating the document, click `canvas-close`; `canvas-panel` is hidden. Click the `artifact-card`; the panel shows `Coffee Guide` again.

**E2E-11 @stage3 persistence (A1).** Create the document, then reload. Clicking the `artifact-card` shows the same content as before the reload.

### Stage 4 — Document editing

**E2E-12 @stage4 AI targeted edit (D4).** Create the document, then send `Make it more formal`. `doc-editor` contains `Coffee is a beverage prepared from roasted beans.` and no longer contains `Coffee is a brewed drink.` Every other line is unchanged. The API shows version 2, author `ai`.

**E2E-13 @stage4 AI builds on manual edits (U4, A5).** Create the document, add ` My note.` by hand (as in E2E-09) and wait for version 2. Send `Add a conclusion`. `doc-editor` contains both `My note.` and a `Conclusion` heading with `Enjoy responsibly.` The API shows version 3, author `ai`. **This is the most important test in the suite.** It proves that the model's edits apply to the latest version, including the user's own changes.

Note: S7's `find` is `Use fresh beans.`, which still matches after the manual edit because the edit only appends after it.

**E2E-14 @stage4 failed edit is atomic (Reliability).** Create the document, then send `Break the edit`. The assistant message shows a tool error state (the `tool-status` text contains `failed`). The document content equals version 1, and no version 2 exists.

**E2E-15 @stage4 highlight to edit (D5, U5).** Create the document. Select the text `Use fresh beans.` in `doc-editor` (triple-click the paragraph or use a range selection). `ask-ai-button` appears near the selection. Click it, type `shorten` into `ask-ai-input`, and submit. The paragraph now reads `Grind beans fresh.` All other content is unchanged. A new version exists with author `ai`.

**E2E-16 @stage4 quick action (D6, U6).** Create the document. Open `quick-actions` and click `quick-action-formal`. `doc-editor` contains `COFFEE Guide` and does not contain `Coffee`. A new version exists.

**E2E-17 @stage4 versions and restore (A3, U9).** Create the document, then send `Make it more formal` (version 2). In `version-switcher`, select version 1: the editor shows `Coffee is a brewed drink.` and is read-only while viewing an old version. Click `version-restore`. The API now shows version 3, author `user`, with content equal to version 1, and the editor is editable again.

### Stage 5 — Diagram canvas

**E2E-18 @stage5 create diagram (G1, G2, U7).** Send `Draw a login flowchart`. `canvas-panel` shows `diagram-editor` (the Excalidraw container is visible and has a `<canvas>`). The API shows a `diagram` artifact at version 1, author `ai`, and `sceneLabels` includes `User`, `Login` and `Dashboard`. The scene contains at least 2 arrow elements.

**E2E-19 @stage5 manual drawing autosaves (G5).** After E2E-18, press `r` (rectangle tool) and drag a rectangle on empty space in the diagram canvas. Within 3 s, the API shows version 2, author `user`, with one more rectangle than version 1.

**E2E-20 @stage5 multiple artifacts (U11).** In one conversation, send `Write a document about coffee`, then `Draw a login flowchart`. `artifact-switcher` lists `Coffee Guide` and `Login Flow`. Switching between them shows `doc-editor` and `diagram-editor` respectively, with the content intact.

### Stage 6 — Diagram editing

**E2E-21 @stage6 AI updates existing diagram (G4, U8).** After E2E-18, send `Add a cache`. The API shows version 2, author `ai`. `sceneLabels` includes `Cache` plus all of `User`, `Login` and `Dashboard`, and the element ids of the original three shapes are unchanged (the diagram was modified, not redrawn).

**E2E-22 @stage6 AI edit keeps manual shapes (A5).** Draw a rectangle by hand (E2E-19), then send `Add a cache`. The hand-drawn rectangle is still present in the new version.

### Stage 7 — Export and polish

**E2E-23 @stage7 document exports (E1, E2, U10).** Create the document.
- `export-md`: the download is named `coffee-guide.md`, and its text contains `## Brewing`.
- `export-pdf`: the download is named `coffee-guide.pdf`, starts with `%PDF`, and is at least 1 KB.
- `export-docx`: the download is named `coffee-guide.docx` and starts with the bytes `PK` (a zip container).

**E2E-24 @stage7 diagram exports (E3, U10).** Create the diagram.
- `export-png`: the download starts with the PNG signature `\x89PNG`.
- `export-svg`: the text contains `<svg`.
- `export-excalidraw`: the JSON parses and has `type: "excalidraw"` with a non-empty `elements` array.

**E2E-25 @stage7 auto title (C5).** In a new chat, send `Say hello`. Within 5 s, the `sidebar-item` text is `Mock Title`.

**E2E-26 @stage7 regenerate and edit-resend (C6).** Send `Say hello`, then click regenerate on the assistant message. There is still exactly one assistant message after the user message, and it contains the S1 text. Then edit the user message to `Show me code` and resend. The assistant reply now contains a `code-block`.

**E2E-27 @stage7 settings (U-2).** Open `settings-link`, set `settings-default-model` to a different allowed model, and save. A new chat's `model-picker` defaults to that model.

### Smoke — real model (never in CI; manual only)

Skipped unless `RUN_SMOKE=1` and `OPENROUTER_API_KEY` are set. No database reset between steps. Assertions stay loose because model output varies.

**SMOKE-1 @smoke chat.** Send `Reply with exactly one word: pong`. The reply matches `/pong/i` within 30 s.

**SMOKE-2 @smoke document.** Send `Create a short document titled "Smoke Test" with two headings.` Within 60 s, `canvas-panel` opens and `doc-title` contains `Smoke Test`.

**SMOKE-3 @smoke edit.** Then send `In the document, change the first heading to "Changed Heading".` Within 60 s, `doc-editor` contains `Changed Heading` and the API shows version 2.

**SMOKE-4 @smoke diagram.** Send `Draw a flowchart with three boxes: Start, Process, End.` Within 60 s, a diagram artifact exists and `sceneLabels` includes all three.

## 3. Playwright MCP walkthrough

After the specs pass for a stage, walk the same scenario IDs through the `playwright-headless` MCP server, which is a separate headless browser driven step by step:

1. Make sure the app is running with `MOCK_LLM=1` (`pnpm dev`, or the Compose stack with `MOCK_LLM=1` in `.env`), then call `POST /api/test/reset`.
2. For each scenario, navigate to the app, take an accessibility snapshot, perform the steps using the `data-testid` selectors, and take a snapshot after each key step.
3. Check the same outcomes the spec asserts, using the API endpoints for diagram content.
4. Record `E2E-xx: pass | fail — note` in `docs/VERIFICATION.md`.

A scenario that passes in `@playwright/test` but fails in the MCP walkthrough (or the reverse) is a bug in either the spec or the app. Investigate and fix it. Don't mark it passed.

## 4. Addendum A — v1.1 stages 8–15

Same rules as above: every scenario becomes a spec before its feature is built, and a stage is done when its scenarios and all earlier ones pass.

### 4.1 Additional selectors

| testid | Element |
|---|---|
| `new-artifact` / `new-document` / `new-diagram` / `new-code` | "New" menu in the chat header and its items |
| `artifact-rename` / `artifact-title-input` | Rename action and its inline title input |
| `artifact-delete` / `artifact-delete-confirm` | Delete action and its confirmation |
| `version-branch` | Branch a copy from the viewed version |
| `copy-markdown` | Copy the current document (or code) to the clipboard |
| `view-markdown` / `markdown-source` | Toggle the raw-Markdown view and its textarea |
| `doc-stats` / `doc-outline` | Word count and the heading outline |
| `format-toolbar` | Formatting toolbar above the document |
| `format-bold` / `format-italic` / `format-strike` / `format-code` / `format-link` | Inline formatting |
| `format-h1` / `format-h2` / `format-h3` / `format-paragraph` | Block type |
| `format-bullet-list` / `format-ordered-list` / `format-task-list` / `format-quote` / `format-code-block` | Block formatting |
| `format-undo` / `format-redo` | History |
| `slash-menu` | "/" command menu (items are `slash-item` with visible labels) |
| `table-toolbar` / `table-add-row` / `table-delete-row` / `table-add-column` / `table-delete-column` / `table-delete` | Table controls, shown while the cursor is in a table |
| `code-editor` / `code-language` | CodeMirror root and the language select |
| `quick-action-<id>` for code | Code quick actions: `comments`, `logs`, `fix-bugs`, `optimize`, `port-python`, `port-typescript` |
| `export-code` | Download the code file |
| `insert-diagram` / `insert-diagram-option` | Insert-diagram menu and its entries (one per diagram) |
| `diagram-embed` | Embedded diagram inside `doc-editor` |
| `diagram-ask-ai-button` / `diagram-ask-ai-input` / `diagram-ask-ai-submit` | Ask AI about the selected shapes |
| `diagram-style-menu` / `style-colorful` / `style-monochrome` / `style-clean` / `style-sketchy` | Style presets |
| `diagram-tidy` | Tidy-up auto-layout |
| `diagram-source` / `mermaid-source` / `mermaid-apply` | Mermaid source panel |
| `diagram-import` | File input for `.excalidraw` import |
| `export-png-transparent` / `export-svg-dark` | Extra diagram exports |

Test hook: when `MOCK_LLM=1` the diagram editor exposes its Excalidraw API as `window.__excalidrawAPI`, so specs can select shapes and edit the library without pixel coordinates. The MCP walkthrough uses real clicks instead.

New API: `GET /api/artifacts/:id` also returns `language` (code only); `GET/PUT /api/library` holds the Excalidraw library items.

### 4.2 Additional mock scripts

| Script | Trigger (contains) | Mock output |
|---|---|---|
| S14 code | `write a python script` | Tool `create_code` with `{ title: "Fibonacci", language: "python", code: "def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint(fib(10))\n" }`, then text `Here is the script.` |
| S15 rename fn | `rename the function` | Tool `edit_document` on the open code artifact: `def fib(n):` → `def fibonacci(n):` and `print(fib(10))` → `print(fibonacci(10))` |
| S16 comments | instruction `quick:comments` | Replacement: the whole code with `# Compute Fibonacci numbers.\n` prepended |
| S17 make red | diagram instruction `make it red` | Tool `update_diagram` restyling every selected id to `strokeColor: "#e03131"`, `backgroundColor: "#ffc9c9"` |
| S18 rename shape | diagram instruction `rename to auth` | Tool `update_diagram` relabelling the first selected id to `Auth` |
| S19 monochrome | `make it monochrome` | Tool `update_diagram` with `[{ op: "preset", preset: "monochrome" }]` on the open diagram |
| S20 sequence | `draw a sequence diagram` | `create_diagram` titled `Greeting`, Mermaid `sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi` |
| S21 class | `draw a class diagram` | `create_diagram` titled `Animals`, Mermaid `classDiagram\n  class Animal\n  class Dog\n  Animal <\|-- Dog` |
| S22 state | `draw a state diagram` | `create_diagram` titled `Runner`, Mermaid `stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> Idle: stop` |
| S23 ER | `draw an er diagram` | `create_diagram` titled `Orders`, Mermaid `erDiagram\n  CUSTOMER \|\|--o{ ORDER : places` |
| S24 mind map | `draw a mind map` | `create_diagram` titled `Coffee Map`, Mermaid `mindmap\n  root((Coffee))\n    Beans\n    Brewing\n    Serving` |

### 4.3 Scenarios

**Stage 8 — Artifact essentials**

**E2E-28 @stage8 blank document (D12).** On `/`, open `new-artifact` and click `new-document`. `canvas-panel` opens with `doc-title` `Untitled document`. Type `Hello world` into `doc-editor`. The API shows a document whose current version contains `Hello world`, authored by `user`. One `sidebar-item` exists.

**E2E-29 @stage8 rename and delete (D12).** Create the S5 document. Click `artifact-rename`, fill `artifact-title-input` with `Brew Notes`, press Enter: `doc-title` shows `Brew Notes`, `artifact-switcher` lists it, and the API title is `Brew Notes`. Click `artifact-delete` then `artifact-delete-confirm`: the switcher no longer lists it and `GET /api/artifacts/:id` returns 404.

**E2E-30 @stage8 branch from a version (A3).** Create the S5 document and send `Make it more formal`. Select version 1 in `version-switcher` and click `version-branch`. `artifact-switcher` now lists two artifacts; the new one, titled `Coffee Guide (v1 copy)`, is open. Its version 1 content equals the original's version 1. The original is still at version 2.

**E2E-31 @stage8 copy, source view, stats and outline (D12).** Create the S5 document. `copy-markdown` puts the API's current content on the clipboard. `doc-stats` contains `11 words`. `doc-outline` lists `Coffee Guide` and `Brewing`. Click `view-markdown`: `markdown-source` shows the current Markdown. Append a paragraph `Extra line.`, click `view-markdown` again: `doc-editor` contains `Extra line.` and the API has a new version by `user` containing it.

**Stage 9 — Formatting**

**E2E-32 @stage9 formatting toolbar (D10).** Create the S5 document. `format-toolbar` is visible. Triple-click `Use fresh beans.` and click `format-bold`: a new version contains `**Use fresh beans.**`. Click inside `Coffee is a brewed drink.` and click `format-bullet-list`: a newer version contains `- Coffee is a brewed drink.`.

**E2E-33 @stage9 slash menu and task list (D10, D11).** Create the S5 document. Click the end of `Use fresh beans.`, press End then Enter, type `/`: `slash-menu` is visible. Type `task`, press Enter, type `Buy beans`: a version contains `- [ ] Buy beans`. Check the checkbox in `doc-editor`: a newer version contains `- [x] Buy beans`.

**E2E-34 @stage9 table controls (D11).** Create the S5 document. On a new line after `Use fresh beans.`, insert a table from the slash menu (`table`). The saved Markdown has a table (lines starting with `|`). With the cursor in the table, `table-toolbar` is visible. Click `table-add-row`: the number of `|` lines grows by one. Click `table-add-column`: the header line has one more cell.

**Stage 10 — Code artifacts**

**E2E-35 @stage10 create code (D8).** Send `Write a python script`. `code-editor` contains `def fib(n):`, `code-language` has value `python`, an `artifact-card` appears, and the API shows kind `code`, language `python`, version 1 by `ai`. Type ` # done` at the end of the last line: within 3 s the API shows version 2 by `user` containing `# done`.

**E2E-36 @stage10 AI edit and quick action on code (D8).** After E2E-35's setup, send `Rename the function`: `code-editor` contains `def fibonacci(n):` and the API shows version 2 by `ai`. Open `quick-actions` and click `quick-action-comments`: `code-editor` contains `# Compute Fibonacci numbers.` and version 3 exists.

**E2E-37 @stage10 language and export (D8).** After E2E-35's setup, select `javascript` in `code-language`: the API language is `javascript`. `export-code` downloads `fibonacci.js` whose text contains `def fib(n):`.

**Stage 11 — Diagram embeds**

**E2E-38 @stage11 embed a live diagram (E4).** In one conversation create the S5 document and the S11 diagram. Switch to `Coffee Guide`, click the end of `Use fresh beans.`, open `insert-diagram` and click the `insert-diagram-option` `Login Flow`. `doc-editor` contains a `diagram-embed` with an `<svg>`, and the saved Markdown contains `diagram://<diagram id>`. Switch to `Login Flow`, send `Add a cache`, switch back: the embed's SVG contains the text `Cache`. `export-md` contains `data:image/svg+xml;base64`, `export-docx` is a zip containing a `word/media/` entry, and `export-pdf` starts with `%PDF`.

**Stage 12 — Diagram selection edits**

**E2E-39 @stage12 restyle the selection (G6).** Create the S11 diagram. Select the `Login` shape (via `window.__excalidrawAPI`). `diagram-ask-ai-button` appears; click it, type `make it red` in `diagram-ask-ai-input`, click `diagram-ask-ai-submit`. The API shows a new version by `ai` where the Login shape has `strokeColor #e03131` and `backgroundColor #ffc9c9`, while User and Dashboard keep their previous colours.

**E2E-40 @stage12 relabel the selection (G6).** Create the S11 diagram. Select `Login`, ask `rename to auth`. The new version's labels include `Auth` and not `Login`, and the shape's id is unchanged.

**Stage 13 — Styles and layout**

**E2E-41 @stage13 style presets (G7).** Create the S11 diagram. Open `diagram-style-menu`, click `style-monochrome`: a new version by `user` where every rectangle has `strokeColor #1e1e1e` and `backgroundColor transparent`. Click `style-clean`: a newer version where every shape has `roughness 0` and `fillStyle solid`.

**E2E-42 @stage13 AI restyle (G7).** Create the S11 diagram and send `Make it monochrome`. The API shows version 2 by `ai` in which every rectangle has `strokeColor #1e1e1e`.

**E2E-43 @stage13 tidy up (G7).** Create the S11 diagram, send `Add a cache`, then click `diagram-tidy`. The new version by `user` has no two shapes overlapping, `User.x < Login.x < Dashboard.x`, `Cache.x > Login.x`, and every arrow keeps its start and end bindings.

**Stage 14 — More diagram types**

**E2E-44 @stage14 editable diagram types (G8).** For each of S20–S24, in a fresh chat: version 1 has no `image` elements, and its labels include, respectively, `Alice` and `Bob`; `Animal` and `Dog`; `Idle` and `Running`; `CUSTOMER` and `ORDER`; `Coffee`, `Beans`, `Brewing` and `Serving`.

**E2E-45 @stage14 Mermaid source (G8).** Create the S11 diagram. Click `diagram-source`: `mermaid-source` contains the S11 Mermaid. Replace `C[Dashboard]` with `C[Home]` and click `mermaid-apply`. A new version by `user` has labels including `Home` and not `Dashboard`.

**Stage 15 — Diagram files and library**

**E2E-46 @stage15 import .excalidraw (G9).** Create the S11 diagram. Set `diagram-import` to `e2e/fixtures/imported.excalidraw` (one labelled rectangle, `Imported`). A new version by `user` has labels exactly `["Imported"]`.

**E2E-47 @stage15 library persists (G9).** Create the S11 diagram. Add one library item through `window.__excalidrawAPI.updateLibrary`. Within 3 s `GET /api/library` returns one item. After a reload it still returns one item.

**E2E-48 @stage15 transparent and dark exports (G9).** Create the S11 diagram. `export-png-transparent` downloads a PNG whose top-left pixel has alpha 0. `export-svg-dark` downloads an SVG that contains `invert`.
