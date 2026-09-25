import { describe, expect, it } from "vitest";
import { CODE_LANGUAGES, CODEMIRROR_NAME, languageExtension, normalizeLanguage } from "./code-languages";

describe("code languages", () => {
  it("normalises common aliases and unknown names", () => {
    expect(normalizeLanguage("Python")).toBe("python");
    expect(normalizeLanguage("py")).toBe("python");
    expect(normalizeLanguage("TS")).toBe("typescript");
    expect(normalizeLanguage("bash")).toBe("shell");
    expect(normalizeLanguage("C#")).toBe("csharp");
    expect(normalizeLanguage("brainfuck")).toBe("text");
  });

  it("maps languages to file extensions", () => {
    expect(languageExtension("python")).toBe("py");
    expect(languageExtension("javascript")).toBe("js");
    expect(languageExtension(null)).toBe("txt");
  });

  it("has a CodeMirror name for every language except plain text", () => {
    for (const l of CODE_LANGUAGES) if (l.id !== "text") expect(CODEMIRROR_NAME[l.id], l.id).toBeTruthy();
  });
});
