"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  LanguageDescription,
  bracketMatching,
  foldGutter,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { CODEMIRROR_NAME } from "@/lib/code-languages";

/** Marks content loaded from outside (new version, version switch) so it isn't autosaved back. */
const External = Annotation.define<boolean>();

// One highlight style that reads the app's light/dark CSS variables.
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier], color: "var(--code-keyword)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--code-string)" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--code-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--code-comment)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--code-function)" },
  { tag: [t.definition(t.variableName), t.className, t.typeName], color: "var(--code-type)" },
  { tag: [t.propertyName, t.attributeName], color: "var(--code-property)" },
  { tag: [t.operator, t.punctuation], color: "var(--muted-foreground)" },
  { tag: t.tagName, color: "var(--code-keyword)" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13.5px", backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65" },
  ".cm-content": { padding: "20px 0 120px", caretColor: "var(--foreground)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--muted-foreground)",
    border: "none",
    paddingLeft: "12px",
  },
  ".cm-activeLine": { backgroundColor: "rgb(127 127 127 / 0.07)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklch, var(--primary) 22%, transparent) !important",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
});

type Props = {
  content: string;
  /** Changing this loads `content` into the editor (new version, version switch). */
  contentKey: string;
  language: string;
  editable: boolean;
  /** Called on every user edit; read the text lazily (debounced). */
  onUserChange: (getText: () => string) => void;
};

/** Code canvas (D8): CodeMirror 6 with lazy-loaded language support. */
export function CodeEditor({ content, contentKey, language, editable, onUserChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langSlot = useRef(new Compartment());
  const editSlot = useRef(new Compartment());
  const onUserChangeRef = useRef(onUserChange);
  onUserChangeRef.current = onUserChange;

  // Create once; later changes arrive through the effects below.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          syntaxHighlighting(highlight),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          theme,
          langSlot.current.of([]),
          editSlot.current.of([EditorView.editable.of(editable), EditorState.readOnly.of(!editable)]),
          EditorView.contentAttributes.of({ "aria-label": "Code" }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || update.transactions.some((tr) => tr.annotation(External))) return;
            onUserChangeRef.current(() => update.view.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const shownKey = useRef(contentKey);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || shownKey.current === contentKey) return;
    shownKey.current = contentKey;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      annotations: External.of(true),
    });
  }, [content, contentKey]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editSlot.current.reconfigure([EditorView.editable.of(editable), EditorState.readOnly.of(!editable)]),
    });
  }, [editable]);

  useEffect(() => {
    let cancelled = false;
    const name = CODEMIRROR_NAME[language];
    const desc = name ? LanguageDescription.matchLanguageName(languages, name, true) : null;
    if (!desc) {
      viewRef.current?.dispatch({ effects: langSlot.current.reconfigure([]) });
      return;
    }
    desc.load().then((support) => {
      if (!cancelled) viewRef.current?.dispatch({ effects: langSlot.current.reconfigure(support) });
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  return <div ref={hostRef} data-testid="code-editor" className="h-full overflow-hidden" />;
}
