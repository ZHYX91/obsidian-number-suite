import { App, MarkdownView, Notice, type Editor, type EditorChange } from "obsidian";

import type { Translate } from "../config/i18n";
import type { NumberSuiteSettings } from "../config/settings";
import type { TransformOperation } from "../core/types";
import { ChangePreviewModal } from "../ui/preview-modal";
import { createSourcePlan } from "./transform-options";

export function runCurrentNoteOperation(
  app: App,
  settings: NumberSuiteSettings,
  operation: TransformOperation,
  translate: Translate,
  targetPath?: string,
): void {
  const matchingViews = (): MarkdownView[] => {
    if (targetPath == null) {
      const active = app.workspace.getActiveViewOfType(MarkdownView);
      return active == null ? [] : [active];
    }
    const matches: MarkdownView[] = [];
    app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file?.path === targetPath) {
        matches.push(leaf.view);
      }
    });
    return matches;
  };
  const matches = matchingViews();
  if (matches.length > 1) {
    new Notice(translate("notice.uniqueEditorRequired"));
    return;
  }
  const view = matches[0] ?? null;
  if (view?.file == null) {
    new Notice(translate("notice.noActiveNote"));
    return;
  }
  if (view.getMode() !== "source") {
    new Notice(translate("notice.editModeRequired"));
    return;
  }
  const source = view.editor.getValue();
  const result = createSourcePlan(source, operation, settings);
  if (result.status === "disabled") {
    new Notice(translate("notice.noteDisabled"));
    return;
  }
  if (result.status === "invalid-frontmatter") {
    new Notice(translate("notice.invalidFrontmatter"));
    return;
  }
  if (result.plan == null || result.plan.changes.length === 0) {
    new Notice(translate("notice.noChanges"));
    return;
  }
  const plan = result.plan;
  const path = view.file.path;
  new ChangePreviewModal({
    app,
    operation,
    documents: [{ path, plan }],
    translate,
    onConfirm: async () => {
      const currentMatches = matchingViews();
      if (
        currentMatches.length !== 1
        || currentMatches[0] !== view
        || view.file?.path !== path
        || view.editor.getValue() !== source
      ) {
        new Notice(translate("notice.stalePreview"));
        return;
      }
      applyEditorPlan(view.editor, plan.changes);
      new Notice(translate("notice.applied", { count: plan.changes.length }));
    },
  }).open();
}

function applyEditorPlan(
  editor: Editor,
  changes: readonly Readonly<{ from: number; to: number; insert: string }>[],
): void {
  const editorChanges: EditorChange[] = [...changes]
    .sort((left, right) => right.from - left.from)
    .map((change) => ({
      from: editor.offsetToPos(change.from),
      to: editor.offsetToPos(change.to),
      text: change.insert,
    }));
  editor.transaction({ changes: editorChanges }, "number-suite");
}
