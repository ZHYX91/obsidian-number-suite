import { App, MarkdownView, Notice, type Editor, type EditorChange } from "obsidian";

import type { Translate } from "../config/i18n";
import type { NumberSuiteSettings } from "../config/settings";
import type { TransformOperation, TransformPlan } from "../core/types";
import { ChangePreviewModal, type PreviewModalOptions } from "../ui/preview-modal";
import { captureSourceBinding } from "./source-binding";
import { createSourcePlan } from "./transform-options";

export function runCurrentNoteOperation(
  app: App,
  settings: NumberSuiteSettings,
  operation: TransformOperation,
  translate: Translate,
  targetPath?: string,
  signal?: AbortSignal,
  presentPreview?: (options: PreviewModalOptions) => void,
): void {
  if (signal?.aborted) return;
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
  const binding = captureSourceBinding(app, view.editor, view);
  const { source } = binding;
  const result = createSourcePlan(source, operation, settings);
  if (result.status === "disabled") {
    new Notice(translate("notice.noteDisabled"));
    return;
  }
  if (result.status === "invalid-frontmatter" || result.status === "invalid-properties") {
    new Notice(translate(result.status === "invalid-frontmatter"
      ? "notice.invalidFrontmatter"
      : "notice.invalidProperties"));
    return;
  }
  if (result.plan == null || (
    result.plan.changes.length === 0
    && result.plan.warnings.length === 0
    && operation !== "remove"
    && operation !== "renumber"
  )) {
    new Notice(translate("notice.noChanges"));
    return;
  }
  const freezePlan = (plan: TransformPlan): TransformPlan => Object.freeze({ ...plan,
    changes: Object.freeze(plan.changes.map((change) => Object.freeze({ ...change }))),
    warnings: Object.freeze(plan.warnings.map((warning) => Object.freeze({ ...warning }))),
  });
  const plan = freezePlan(result.plan);
  let offeredPlan = plan;
  const path = view.file.path;
  const present = presentPreview ?? ((options: PreviewModalOptions) => new ChangePreviewModal(options).open());
  present({
    app,
    operation,
    documents: [{ path, plan }],
    translate,
    ...(signal === undefined ? {} : { signal }),
    ...(operation === "remove" || operation === "renumber" ? {
      cleanupScope: settings.cleanupScope,
      onCleanupScopeChange: (scope: import("../core/types").CleanupScope) => {
        if (signal?.aborted) return [];
        const replanned = createSourcePlan(source, operation, settings, scope);
        if (replanned.status !== "ready" || replanned.plan == null) return [];
        const scopedPlan = freezePlan(replanned.plan);
        offeredPlan = scopedPlan;
        return [{ path, plan: scopedPlan }];
      },
    } : {}),
    onConfirm: async (documents = [{ path, plan }]) => {
      if (signal?.aborted) return;
      const currentMatches: MarkdownView[] = [];
      app.workspace.iterateAllLeaves((leaf) => {
        if (leaf.view instanceof MarkdownView && leaf.view.file?.path === path) currentMatches.push(leaf.view);
      });
      if (
        currentMatches.length !== 1
        || currentMatches[0] !== view
        || !binding.isCurrent()
      ) {
        new Notice(translate("notice.stalePreview"));
        return false;
      }
      const selected = documents[0]?.plan;
      if (documents.length !== 1 || documents[0]?.path !== path || selected !== offeredPlan) return false;
      if (selected.changes.length === 0) return;
      applyEditorPlan(binding.editor, selected.changes);
      new Notice(translate("notice.applied", { count: selected.changes.length }));
    },
  });
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
