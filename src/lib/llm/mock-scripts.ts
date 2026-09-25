import type { ArtifactContext, ArtifactListing } from "./context";
import { parseRewriteMessage } from "./rewrite-prompt";
import { TOOL_NAMES } from "@/lib/tools/schemas";

/** Scripted responses for MOCK_LLM=1 (docs/E2E_TESTS.md §1.3). Pure, so it is unit-tested directly. */

export type MockMode = "chat" | "rewrite" | "title";

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

type ChatScript = { trigger: string; run: (r: MockRequest) => MockStep; followUp?: string };

function target(ctx: ArtifactContext, kind: ArtifactListing["kind"]): ArtifactListing | undefined {
  if (ctx.open?.kind === kind) return ctx.open;
  return ctx.artifacts.filter((a) => a.kind === kind).at(-1);
}

function editOpenDocument(edits: { find: string; replace: string }[]) {
  return (r: MockRequest): MockStep => {
    const doc = target(r.context, "document");
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
    run: editOpenDocument([{ find: "Use fresh beans.", replace: "Use fresh beans.\n\n## Conclusion\n\nEnjoy responsibly." }]),
  },
  { trigger: "break the edit", run: editOpenDocument([{ find: "TEXT THAT DOES NOT EXIST", replace: "x" }]) },
  {
    trigger: "draw a login flowchart",
    run: () =>
      tool(TOOL_NAMES.createDiagram, {
        title: "Login Flow",
        mermaid: "flowchart LR\n  A[User] --> B[Login]\n  B --> C[Dashboard]",
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
];

function planRewrite(r: MockRequest): MockStep {
  const req = parseRewriteMessage(r.lastUser);
  if (!req) return text(NO_SCRIPT);
  const instruction = req.instruction.toLowerCase();
  const rewrite = (replacement: string) =>
    tool(TOOL_NAMES.rewriteSelection, { artifact_id: req.artifactId, selected_text: req.selectedText, replacement });
  if (instruction.includes("quick:formal")) return rewrite(req.selectedText.replaceAll("Coffee", "COFFEE"));
  if (instruction.includes("shorten")) return rewrite("Grind beans fresh.");
  return text(NO_SCRIPT);
}

export function planResponse(r: MockRequest): MockStep {
  if (r.mode === "title") return text("Mock Title");
  if (r.mode === "rewrite") return r.afterTool ? { type: "none" } : planRewrite(r);

  const prompt = r.lastUser.toLowerCase();
  const script = CHAT_SCRIPTS.find((s) => prompt.includes(s.trigger));
  if (!script) return r.afterTool ? { type: "none" } : text(NO_SCRIPT);
  if (r.afterTool) return script.followUp ? text(script.followUp) : { type: "none" };
  return script.run(r);
}
