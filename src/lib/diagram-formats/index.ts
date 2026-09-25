import { parseD2 } from "./d2";
import { parseDot } from "./dot";
import { type Graph, parseGraphJson } from "./graph";
import { parsePlantUml } from "./plantuml";

export { DiagramSyntaxError, type Graph } from "./graph";

/** Diagram source languages (G10). Mermaid is converted by mermaid-to-excalidraw in the browser. */
export const DIAGRAM_LANGUAGES = ["mermaid", "graph", "dot", "plantuml", "d2"] as const;
export type DiagramLanguage = (typeof DIAGRAM_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<DiagramLanguage, string> = {
  mermaid: "Mermaid",
  graph: "Graph (JSON)",
  dot: "Graphviz DOT",
  plantuml: "PlantUML",
  d2: "D2",
};

/** Source → what the browser draws: a graph, or Mermaid for mermaid-to-excalidraw. */
export type ParsedSource = { graph: Graph } | { mermaid: string };

/** Parse non-Mermaid source. Throws DiagramSyntaxError with a line number when it can't. */
export function parseSource(language: Exclude<DiagramLanguage, "mermaid">, code: string): ParsedSource {
  switch (language) {
    case "graph":
      return { graph: parseGraphJson(code) };
    case "dot":
      return { graph: parseDot(code) };
    case "d2":
      return { graph: parseD2(code) };
    case "plantuml":
      return parsePlantUml(code);
  }
}
