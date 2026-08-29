import {
  Notice,
  type App,
  type Editor,
  type EditorChange,
  type MarkdownFileInfo,
  type MarkdownView,
  type Menu,
} from "obsidian";

import type { Translate } from "../config/i18n";
import {
  createCaptionInsertionPlanForTarget,
  findCaptionInsertionTarget,
  findCaptionInsertionTargetForTable,
  type CaptionInsertionTarget,
} from "../core/caption-insertion";
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
  sourceTableIndex: number,
): void {
  addResolvedCaptionContextMenuItem(
    app,
    menu,
    editor,
    info,
    translate,
    (source) => findCaptionInsertionTargetForTable(source, sourceTableIndex),
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

  menu.addItem((item) => item
    .setTitle(menuTitle(target, translate))
    .setIcon({
      Figure: "image-plus",
      Table: "table-properties",
      Equation: "sigma",
      Code: "square-code",
    }[target.kind])
    .onClick(() => {
      new CaptionInsertionModal({
        app,
        target,
        translate,
        onConfirm: async (title) => {
          const currentTarget = resolveTarget(editor.getValue());
          const plan = createCaptionInsertionPlanForTarget(source, target, title);
          if (
            info.file?.path !== path
            || editor.getValue() !== source
            || currentTarget == null
            || !sameTarget(currentTarget, target)
            || plan == null
          ) {
            new Notice(translate("notice.stalePreview"));
            return;
          }
          applyChanges(editor, plan.changes);
          new Notice(translate(target.action === "insert"
            ? "caption.notice.inserted"
            : target.action === "relocate"
              ? "caption.notice.relocated"
              : "caption.notice.normalized"));
        },
      }).open();
    }));
}
