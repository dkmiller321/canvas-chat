import type { ArtifactContext, ArtifactListing } from "./context";
import { parseDiagramRewriteMessage, parseRewriteMessage } from "./rewrite-prompt";
import { TOOL_NAMES } from "@/lib/tools/schemas";

/** Scripted responses for MOCK_LLM=1 (docs/E2E_TESTS.md §1.3). Pure, so it is unit-tested directly. */

export type MockMode = "chat" | "rewrite" | "diagram-rewrite" | "title";

export type MockRequest = {
  mode: MockMode;
  /** Text of the last user message. */
  lastUser: string;
  modelId: string;
  context: ArtifactContext;
  /** True when the previous step ended in a tool call and this step follows its result. */
  afterTool: boolean;
};

export type MockStep =
  | { type: "text"; text: string; chunkDelayMs: number }
  | { type: "tool"; toolName: string; input: unknown }
  | { type: "none" };

export const NO_SCRIPT = "Mock: no script for this prompt.";
const CHUNK_DELAY_MS = 40;

const text = (t: string, chunkDelayMs = CHUNK_DELAY_MS): MockStep => ({ type: "text", text: t, chunkDelayMs });
const tool = (toolName: string, input: unknown): MockStep => ({ type: "tool", toolName, input });

export const COFFEE_MARKDOWN = "# Coffee Guide\n\nCoffee is a brewed drink.\n\n## Brewing\n\nUse fresh beans.";
export const FIB_CODE =
  "def fib(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\n\nprint(fib(10))\n";
export const LOGIN_MERMAID = "flowchart LR\n  A[User] --> B[Login]\n  B --> C[Dashboard]";

const diagram = (title: string, mermaid: string) => () => tool(TOOL_NAMES.createDiagram, { title, mermaid });

type ChatScript = { trigger: string; run: (r: MockRequest) => MockStep; followUp?: string };

function target(ctx: ArtifactContext, kind: ArtifactListing["kind"]): ArtifactListing | undefined {
  if (ctx.open?.kind === kind) return ctx.open;
  return ctx.artifacts.filter((a) => a.kind === kind).at(-1);
}

function editOpenDocument(edits: { find: string; replace: string }[], kind: "document" | "code" = "document") {
  return (r: MockRequest): MockStep => {
    const doc = target(r.context, kind);
    return doc ? tool(TOOL_NAMES.editDocument, { artifact_id: doc.id, edits }) : text(NO_SCRIPT);
  };
}

const CHAT_SCRIPTS: ChatScript[] = [
  { trigger: "say hello", run: () => text("Hello! I am the mock model and streaming works.") },
  { trigger: "write a long story", run: () => text("word ".repeat(200), 50) },
  { trigger: "show me code", run: () => text("Here is code:\n\n```ts\nconst answer = 42;\n```") },
  { trigger: "which model", run: (r) => text(`Mock reply from ${r.modelId}`) },
  {
    trigger: "write a document about coffee",
    run: () => tool(TOOL_NAMES.createDocument, { title: "Coffee Guide", markdown: COFFEE_MARKDOWN }),
    followUp: "I drafted the Coffee Guide.",
  },
  {
    trigger: "make it more formal",
    run: editOpenDocument([
      { find: "Coffee is a brewed drink.", replace: "Coffee is a beverage prepared from roasted beans." },
    ]),
    followUp: "Done.",
  },
  {
    trigger: "add a conclusion",
    run: editOpenDocument([
      { find: "Use fresh beans.", replace: "Use fresh beans.\n\n## Conclusion\n\nEnjoy responsibly." },
    ]),
  },
  { trigger: "break the edit", run: editOpenDocument([{ find: "TEXT THAT DOES NOT EXIST", replace: "x" }]) },
  {
    trigger: "draw a login flowchart",
    run: () =>
      tool(TOOL_NAMES.createDiagram, {
        title: "Login Flow",
        mermaid: LOGIN_MERMAID,
      }),
  },
  {
    trigger: "add a cache",
    run: (r) => {
      const open = r.context.open;
      const login = open?.kind === "diagram" ? open.elements.find((e) => e.label === "Login") : undefined;
      if (!open || !login) return text(NO_SCRIPT);
      return tool(TOOL_NAMES.updateDiagram, {
        artifact_id: open.id,
        operations: [
          { op: "add", id: "cache", type: "rectangle", label: "Cache" },
          { op: "add", type: "arrow", from: login.id, to: "cache" },
        ],
      });
    },
  },
  {
    trigger: "write a python script",
    run: () => tool(TOOL_NAMES.createCode, { title: "Fibonacci", language: "python", code: FIB_CODE }),
    followUp: "Here is the script.",
  },
  {
    trigger: "rename the function",
    run: editOpenDocument(
      [
        { find: "def fib(n):", replace: "def fibonacci(n):" },
        { find: "print(fib(10))", replace: "print(fibonacci(10))" },
      ],
      "code",
    ),
  },
  {
    trigger: "make it monochrome",
    run: (r) => {
      const d = target(r.context, "diagram");
      return d
        ? tool(TOOL_NAMES.updateDiagram, { artifact_id: d.id, operations: [{ op: "preset", preset: "monochrome" }] })
        : text(NO_SCRIPT);
    },
  },
  {
    trigger: "draw a sequence diagram",
    run: diagram("Greeting", "sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi"),
  },
  {
    trigger: "draw a class diagram",
    run: diagram("Animals", "classDiagram\n  class Animal\n  class Dog\n  Animal <|-- Dog"),
  },
  {
    trigger: "draw a state diagram",
    run: diagram("Runner", "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running: start\n  Running --> Idle: stop"),
  },
  { trigger: "draw an er diagram", run: diagram("Orders", "erDiagram\n  CUSTOMER ||--o{ ORDER : places") },
  {
    trigger: "draw a mind map",
    run: diagram("Coffee Map", "mindmap\n  root((Coffee))\n    Beans\n    Brewing\n    Serving"),
  },
];

function planRewrite(r: MockRequest): MockStep {
  const req = parseRewriteMessage(r.lastUser);
  if (!req) return text(NO_SCRIPT);
  const instruction = req.instruction.toLowerCase();
  const rewrite = (replacement: string) =>
    tool(TOOL_NAMES.rewriteSelection, { artifact_id: req.artifactId, selected_text: req.selectedText, replacement });
  if (instruction.includes("quick:formal")) return rewrite(req.selectedText.replaceAll("Coffee", "COFFEE"));
  if (instruction.includes("quick:comments")) return rewrite(`# Compute Fibonacci numbers.\n${req.selectedText}`);
  if (instruction.includes("shorten")) return rewrite("Grind beans fresh.");
  return text(NO_SCRIPT);
}

function planDiagramRewrite(r: MockRequest): MockStep {
  const req = parseDiagramRewriteMessage(r.lastUser);
  if (!req || req.selectedIds.length === 0) return text(NO_SCRIPT);
  const instruction = req.instruction.toLowerCase();
  const update = (operations: unknown[]) => tool(TOOL_NAMES.updateDiagram, { artifact_id: req.artifactId, operations });
  if (instruction.includes("make it red")) {
    return update(
      req.selectedIds.map((id) => ({ op: "restyle", id, strokeColor: "#e03131", backgroundColor: "#ffc9c9" })),
    );
  }
  if (instruction.includes("rename to auth")) return update([{ op: "relabel", id: req.selectedIds[0], label: "Auth" }]);
  return text(NO_SCRIPT);
}

export function planResponse(r: MockRequest): MockStep {
  if (r.mode === "title") return text("Mock Title");
  if (r.mode === "diagram-rewrite") return r.afterTool ? { type: "none" } : planDiagramRewrite(r);
  if (r.mode === "rewrite") return r.afterTool ? { type: "none" } : planRewrite(r);

  const prompt = r.lastUser.toLowerCase();
  const script = CHAT_SCRIPTS.find((s) => prompt.includes(s.trigger));
  if (!script) return r.afterTool ? { type: "none" } : text(NO_SCRIPT);
  if (r.afterTool) return script.followUp ? text(script.followUp) : { type: "none" };
  return script.run(r);
}
