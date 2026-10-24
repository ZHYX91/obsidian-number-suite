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
import { captureSourceBinding } from "./source-binding";
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
  signal?: AbortSignal,
): void {
  const cursorOffset = contextOffset ?? editor.posToOffset(editor.getCursor("head"));
  addResolvedCaptionContextMenuItem(
    app,
    menu,
    editor,
    info,
    translate,
    (source) => findCaptionInsertionTarget(source, cursorOffset),
    signal,
  );
}

export function addStructuralTableCaptionContextMenuItem(
  app: App,
  menu: Menu,
  editor: Editor,
  info: MarkdownView | MarkdownFileInfo,
  translate: Translate,
  snapshot: StructuralTableSourceSnapshot,
  signal?: AbortSignal,
): void {
  addResolvedCaptionContextMenuItem(
    app,
    menu,
    editor,
    info,
    translate,
    (source) => resolveStructuralTableCaptionTarget(source, info.file?.path ?? null, snapshot),
    signal,
  );
}

function addResolvedCaptionContextMenuItem(
  app: App,
  menu: Menu,
  editor: Editor,
  info: MarkdownView | MarkdownFileInfo,
  translate: Translate,
  resolveTarget: (source: string) => CaptionInsertionTarget | null,
  signal?: AbortSignal,
): void {
  if (signal?.aborted) return;
  const file = info.file;
  if (file == null || file.extension.toLowerCase() !== "md") return;
  const binding = captureSourceBinding(app, editor, info);
  const { source, view: sourceView } = binding;
  const target = resolveTarget(source);
  if (target == null) return;
  if (contributedCaptionMenus.has(menu)) return;
  contributedCaptionMenus.add(menu);


  menu.addItem((item) => item
    .setTitle(menuTitle(target, translate))
    .setIcon({
      Figure: "image-plus",
      Table: "table-properties",
      Equation: "sigma",
      Code: "square-code",
    }[target.kind])
    .onClick(() => {
      if (signal?.aborted) return;
      if (!binding.isCurrent()) { new Notice(translate("notice.stalePreview")); return; }
      let appliedSource: string | null = null;
      new CaptionInsertionModal({
        app,
        target,
        translate,
        ...(signal === undefined ? {} : { signal }),
        onConfirm: async (title) => {
          if (signal?.aborted) return false;
          const currentTarget = resolveTarget(editor.getValue());
          const plan = createCaptionInsertionPlanForTarget(source, target, title);
          if (
            !binding.isCurrent()
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
          if (!signal?.aborted && appliedSource !== null && sourceView !== null && binding.isCurrent(appliedSource)
            && app.workspace.getActiveViewOfType(MarkdownView) === sourceView
            && editor.getValue() === appliedSource) editor.focus();
        },
      }).open();
    }));
}
