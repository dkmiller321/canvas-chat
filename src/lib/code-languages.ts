/** Languages offered for code artifacts (D8): picker label, CodeMirror name and file extension. */
export const CODE_LANGUAGES = [
  { id: "python", label: "Python", ext: "py" },
  { id: "javascript", label: "JavaScript", ext: "js" },
  { id: "typescript", label: "TypeScript", ext: "ts" },
  { id: "tsx", label: "TSX", ext: "tsx" },
  { id: "jsx", label: "JSX", ext: "jsx" },
  { id: "go", label: "Go", ext: "go" },
  { id: "rust", label: "Rust", ext: "rs" },
  { id: "java", label: "Java", ext: "java" },
  { id: "kotlin", label: "Kotlin", ext: "kt" },
  { id: "csharp", label: "C#", ext: "cs" },
  { id: "cpp", label: "C++", ext: "cpp" },
  { id: "c", label: "C", ext: "c" },
  { id: "ruby", label: "Ruby", ext: "rb" },
  { id: "php", label: "PHP", ext: "php" },
  { id: "swift", label: "Swift", ext: "swift" },
  { id: "sql", label: "SQL", ext: "sql" },
  { id: "shell", label: "Shell", ext: "sh" },
  { id: "html", label: "HTML", ext: "html" },
  { id: "css", label: "CSS", ext: "css" },
  { id: "json", label: "JSON", ext: "json" },
  { id: "yaml", label: "YAML", ext: "yml" },
  { id: "markdown", label: "Markdown", ext: "md" },
  { id: "text", label: "Plain text", ext: "txt" },
] as const;

/** Aliases models commonly use for the same language. */
const ALIASES: Record<string, string> = {
  py: "python",
  js: "javascript",
  node: "javascript",
  ts: "typescript",
  golang: "go",
  rs: "rust",
  "c#": "csharp",
  cs: "csharp",
  "c++": "cpp",
  rb: "ruby",
  bash: "shell",
  sh: "shell",
  zsh: "shell",
  yml: "yaml",
  md: "markdown",
  plaintext: "text",
};

export function normalizeLanguage(name: string): string {
  const id = name.trim().toLowerCase();
  const resolved = ALIASES[id] ?? id;
  return CODE_LANGUAGES.some((l) => l.id === resolved) ? resolved : "text";
}

export function languageExtension(id: string | null | undefined): string {
  return CODE_LANGUAGES.find((l) => l.id === id)?.ext ?? "txt";
}

/** Names CodeMirror's language-data understands for each id. */
export const CODEMIRROR_NAME: Record<string, string> = {
  python: "Python",
  javascript: "JavaScript",
  typescript: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  go: "Go",
  rust: "Rust",
  java: "Java",
  kotlin: "Kotlin",
  csharp: "C#",
  cpp: "C++",
  c: "C",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  sql: "SQL",
  shell: "Shell",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  yaml: "YAML",
  markdown: "Markdown",
};
