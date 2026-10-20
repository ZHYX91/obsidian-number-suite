import {
  Notice,
  MarkdownView,
  type App,
  type Editor,
  type EditorChange,
  type MarkdownFileInfo,
  type Menu,
} from "obsidian";

import type { Translate } from "../config/i18n";
import {
  createCaptionInsertionPlanForTarget,
  findCaptionInsertionTarget,
  type CaptionInsertionTarget,
} from "../core/caption-insertion";
import {
  resolveStructuralTableCaptionTarget,
  type StructuralTableSourceSnapshot,
} from "../integration/structural-table-source";
import { CaptionInsertionModal } from "../ui/caption-insertion-modal";

const contributedCaptionMenus = new WeakSet<Menu>();

function sameTarget(left: CaptionInsertionTarget, right: CaptionInsertionTarget): boolean {
  return left.kind === right.kind
    && left.action === right.action
    && left.from === right.from
    && left.to === right.to;
}

function menuTitle(target: CaptionInsertionTarget, t: Translate): string {
  const action = target.action === "insert" ? "insert"
    : target.action === "relocate" ? "relocate" : "normalize";
  return t(`caption.menu.${target.kind.toLowerCase()}.${action}` as Parameters<Translate>[0]);
}

function applyChanges(
  editor: Editor,
  changes: readonly Readonly<{ from: number; to: number; insert: string }>[],
): void {
  const editorChanges: EditorChange[] = changes.map((change) => ({
    from: editor.offsetToPos(change.from),
    to: editor.offsetToPos(change.to),
    text: change.insert,
  }));
  editor.transaction({ changes: editorChanges }, "number-suite-caption");
}

export function addCaptionContextMenuItem(
  app: App,
  menu: Menu,
  editor: Editor,
  info: MarkdownView | MarkdownFileInfo,
  translate: Translate,
  contextOffset?: number,
): void {
  const cursorOffset = contextOffset ?? editor.posToOffset(editor.getCursor("head"));
  addResolvedCaptionContextMenuItem(
    app,
    menu,
    editor,
    info,
    translate,
    (source) => findCaptionInsertionTarget(source, cursorOffset),
  );
}

export function addStructuralTableCaptionContextMenuItem(
  app: App,
  menu: Menu,
  editor: Editor,
  info: MarkdownView | MarkdownFileInfo,
  translate: Translate,
  snapshot: StructuralTableSourceSnapshot,
): void {
  addResolvedCaptionContextMenuItem(
    app,
    menu,
    editor,
    info,
    translate,
    (source) => resolveStructuralTableCaptionTarget(source, info.file?.path ?? null, snapshot),
  );
}

function addResolvedCaptionContextMenuItem(
  app: App,
  menu: Menu,
  editor: Editor,
  info: MarkdownView | MarkdownFileInfo,
  translate: Translate,
  resolveTarget: (source: string) => CaptionInsertionTarget | null,
): void {
  const file = info.file;
  if (file == null || file.extension.toLowerCase() !== "md") return;
  const source = editor.getValue();
  const target = resolveTarget(source);
  if (target == null) return;
  if (contributedCaptionMenus.has(menu)) return;
  contributedCaptionMenus.add(menu);
  const path = file.path;
  const sourceView = info instanceof MarkdownView ? info : null;
  const isCurrentEditor = (): boolean => info.file === file && file.path === path
    && (sourceView === null || (sourceView.editor === editor && sourceView.containerEl.isConnected));

  menu.addItem((item) => item
    .setTitle(menuTitle(target, translate))
    .setIcon({
      Figure: "image-plus",
      Table: "table-properties",
      Equation: "sigma",
      Code: "square-code",
    }[target.kind])
    .onClick(() => {
      let appliedSource: string | null = null;
      new CaptionInsertionModal({
        app,
        target,
        translate,
        onConfirm: async (title) => {
          const currentTarget = resolveTarget(editor.getValue());
          const plan = createCaptionInsertionPlanForTarget(source, target, title);
          if (
            !isCurrentEditor()
            || editor.getValue() !== source
            || currentTarget == null
            || !sameTarget(currentTarget, target)
            || plan == null
          ) {
            new Notice(translate("notice.stalePreview"));
            return false;
          }
          applyChanges(editor, plan.changes);
          appliedSource = plan.result;
          new Notice(translate(target.action === "insert"
            ? "caption.notice.inserted"
            : target.action === "relocate"
              ? "caption.notice.relocated"
              : "caption.notice.normalized"));
          return true;
        },
        onApplied: () => {
          // The native table cell may have been rebuilt by the transaction.
          // Restore focus after Modal.close(), using the original editor only.
          if (sourceView !== null && isCurrentEditor()
            && app.workspace.getActiveViewOfType(MarkdownView) === sourceView
            && editor.getValue() === appliedSource) editor.focus();
        },
      }).open();
    }));
}
