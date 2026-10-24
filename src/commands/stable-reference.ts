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
import { captureSourceBinding } from "./source-binding";
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

async function copyWithNotice(plan: StableReferencePlan, t: Translate, created: boolean, signal?: AbortSignal): Promise<void> {
  try {
    await writeClipboard(plan.link);
    if (signal?.aborted) return;
    new Notice(t(created ? "reference.notice.createdCopied" : "reference.notice.copied"));
  } catch (error: unknown) {
    if (signal?.aborted) return;
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
  signal?: AbortSignal,
): void {
  if (signal?.aborted) return;
  const file = info.file;
  if (file == null || file.extension.toLowerCase() !== "md") return;
  const binding = captureSourceBinding(app, editor, info);
  const { source } = binding;
  const cursorOffset = contextOffset ?? editor.posToOffset(editor.getCursor("head"));
  const plan = createStableReferencePlan(source, cursorOffset);
  if (plan == null) return;
  menu.addItem((item) => item
    .setTitle(translate("reference.menu.copy"))
    .setIcon("copy")
    .onClick(() => {
      if (signal?.aborted) return;
      if (!binding.isCurrent()) { new Notice(translate("notice.stalePreview")); return; }
      if (plan.change == null) {
        const current = editor.getValue();
        const refreshed = createStableReferencePlan(current, cursorOffset);
        if (
          !binding.isCurrent()
          || current !== source
          || refreshed == null
          || refreshed.change != null
          || refreshed.blockId !== plan.blockId
          || refreshed.target.kind !== plan.target.kind
          || refreshed.target.line !== plan.target.line
          || refreshed.link !== plan.link
        ) {
          new Notice(translate("notice.stalePreview"));
          return;
        }
        void copyWithNotice(refreshed, translate, false, signal);
        return;
      }
      new StableReferenceModal({
        app,
        plan,
        translate,
        ...(signal === undefined ? {} : { signal }),
        onConfirm: async () => {
          if (signal?.aborted) return;
          const current = editor.getValue();
          const refreshed = createStableReferencePlan(current, cursorOffset);
          if (
            !binding.isCurrent()
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
          await copyWithNotice(plan, translate, true, signal);
        },
      }).open();
    }));
}
