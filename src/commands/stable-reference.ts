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
import { createStableReferencePlan, type StableReferencePlan } from "../core/stable-reference";
import { StableReferenceModal } from "../ui/stable-reference-modal";

function applyChange(editor: Editor, plan: StableReferencePlan): void {
  if (plan.change == null) return;
  const change: EditorChange = {
    from: editor.offsetToPos(plan.change.from),
    to: editor.offsetToPos(plan.change.to),
    text: plan.change.insert,
  };
  editor.transaction({ changes: [change] }, "number-suite-stable-reference");
}

async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator === "undefined" || navigator.clipboard?.writeText == null) {
    throw new Error("Clipboard API is unavailable.");
  }
  await navigator.clipboard.writeText(text);
}

async function copyWithNotice(plan: StableReferencePlan, t: Translate, created: boolean): Promise<void> {
  try {
    await writeClipboard(plan.link);
    new Notice(t(created ? "reference.notice.createdCopied" : "reference.notice.copied"));
  } catch (error: unknown) {
    console.error("Number Suite could not copy the cross-reference", error);
    new Notice(t("reference.notice.copyFailed"));
  }
}

export function addStableReferenceContextMenuItem(
  app: App,
  menu: Menu,
  editor: Editor,
  info: MarkdownView | MarkdownFileInfo,
  translate: Translate,
  contextOffset?: number,
): void {
  const file = info.file;
  if (file == null || file.extension.toLowerCase() !== "md") return;
  const source = editor.getValue();
  const cursorOffset = contextOffset ?? editor.posToOffset(editor.getCursor("head"));
  const plan = createStableReferencePlan(source, cursorOffset);
  if (plan == null) return;
  const path = file.path;
  menu.addItem((item) => item
    .setTitle(translate("reference.menu.copy"))
    .setIcon("copy")
    .onClick(() => {
      if (plan.change == null) {
        void copyWithNotice(plan, translate, false);
        return;
      }
      new StableReferenceModal({
        app,
        plan,
        translate,
        onConfirm: async () => {
          const current = editor.getValue();
          const refreshed = createStableReferencePlan(current, cursorOffset);
          if (
            info.file?.path !== path
            || current !== source
            || refreshed == null
            || refreshed.blockId !== plan.blockId
            || refreshed.target.kind !== plan.target.kind
            || refreshed.target.line !== plan.target.line
          ) {
            new Notice(translate("notice.stalePreview"));
            return;
          }
          applyChange(editor, plan);
          await copyWithNotice(plan, translate, true);
        },
      }).open();
    }));
}
