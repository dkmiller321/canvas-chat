import { Extension, type Editor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const key = new PluginKey<DecorationSet>("keepSelection");

type Range = { from: number; to: number };

/**
 * Paints a range with `.ask-ai-selection` so the passage being rewritten stays
 * visible after focus moves to the Ask AI box. Purely visual: never touches the document.
 */
export const KeepSelection = Extension.create({
  name: "keepSelection",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const range = tr.getMeta(key) as Range | null | undefined;
            if (range === null) return DecorationSet.empty;
            if (range) {
              return DecorationSet.create(tr.doc, [Decoration.inline(range.from, range.to, { class: "ask-ai-selection" })]);
            }
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});

export function showKeptSelection(editor: Editor, range: Range | null) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(key, range));
}
