import { Extension } from "@tiptap/react";
import { Plugin, TextSelection } from "@tiptap/pm/state";

/**
 * ProseMirror learns about a click's caret position from the browser's
 * asynchronous `selectionchange` event. A key pressed within milliseconds of the
 * click (automation, voice control, fast typing) would otherwise act on the old
 * selection, e.g. Enter splitting the document at position 0. Before any key is
 * handled, take the selection from the DOM if it differs.
 */
export const SyncSelectionOnKey = Extension.create({
  name: "syncSelectionOnKey",
  priority: 10_000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleKeyDown(view) {
            const dom = view.dom.ownerDocument.getSelection();
            if (!dom || dom.rangeCount === 0 || !dom.anchorNode || !dom.focusNode) return false;
            if (!view.dom.contains(dom.anchorNode) || !view.dom.contains(dom.focusNode)) return false;
            let anchor: number;
            let head: number;
            try {
              anchor = view.posAtDOM(dom.anchorNode, dom.anchorOffset);
              head = view.posAtDOM(dom.focusNode, dom.focusOffset);
            } catch {
              // Not inside editable content (e.g. a node view's chrome): leave it to ProseMirror.
              return false;
            }
            const { selection } = view.state;
            if (selection.anchor === anchor && selection.head === head) return false;
            if (!(selection instanceof TextSelection) && selection.from !== selection.to) return false;
            view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
            return false;
          },
        },
      }),
    ];
  },
});
