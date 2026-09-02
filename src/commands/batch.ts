import { App, MarkdownView, Notice, TFile, type TFolder } from "obsidian";

import type { Translate } from "../config/i18n";
import type {
  NumberSuiteSettings,
  LastBatchSnapshot,
} from "../config/settings";
import type { TransformOperation } from "../core/types";
import { digestText } from "../core/text-digest";
import { ContentConflictError } from "../application/conditional-replace";
import { BatchOperationModal, FolderScopeModal, type BatchScope } from "../ui/batch-modals";
import { ChangePreviewModal, type PreviewDocument } from "../ui/preview-modal";
import { createSourcePlan } from "./transform-options";

export interface BatchPersistence {
  getLastBatch(): LastBatchSnapshot | null;
  setLastBatch(snapshot: LastBatchSnapshot | null): Promise<void>;
}

function pathInFolder(path: string, folder: TFolder | null): boolean {
  return folder == null || path.startsWith(`${folder.path}/`);
}

function isExcluded(path: string, excludedFolders: readonly string[]): boolean {
  return excludedFolders.some((folder) => path === folder || path.startsWith(`${folder}/`));
}

function snapshotSizeBytes(snapshot: LastBatchSnapshot): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
}

interface BoundBatchFile {
  readonly file: TFile;
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

class BatchChangedError extends Error {
  constructor(readonly writeMayHaveOccurred = false) {
    super("A batch file, path, or editor binding changed.");
    this.name = "BatchChangedError";
  }
}

class BatchWriteUncertainError extends Error {
  constructor(readonly original: unknown) {
    super("A guarded batch write may have completed before its failure was observed.");
    this.name = "BatchWriteUncertainError";
  }
}

function isBatchConflict(error: unknown): boolean {
  return error instanceof BatchChangedError
    || error instanceof ContentConflictError
    || (error instanceof BatchWriteUncertainError && isBatchConflict(error.original));
}

export class BatchController {
  private operationActive = false;

  constructor(
    private readonly app: App,
    private readonly getSettings: () => NumberSuiteSettings,
    private readonly persistence: BatchPersistence,
  ) {}

  private async runExclusive(translate: Translate, operation: () => Promise<void>): Promise<void> {
    if (this.operationActive) {
      new Notice(translate("notice.batchBusy"));
      return;
    }
    this.operationActive = true;
    try {
      await operation();
    } finally {
      this.operationActive = false;
    }
  }

  open(translate: Translate): void {
    new FolderScopeModal(this.app, translate, (scope) => {
      const files = this.filesForScope(scope);
      new BatchOperationModal(this.app, translate, files.length, (operation) => {
        void this.preview(scope, operation, translate).catch((error: unknown) => {
          console.error("Number Suite batch preview failed", error);
          new Notice(translate("notice.batchFailed"));
        });
      }).open();
    }).open();
  }

  async undo(translate: Translate): Promise<void> {
    await this.runExclusive(translate, async () => this.undoExclusive(translate));
  }

  private async undoExclusive(translate: Translate): Promise<void> {
    const snapshot = this.persistence.getLastBatch();
    if (snapshot == null) {
      new Notice(translate("notice.noBatch"));
      return;
    }
    const preflight: BoundBatchFile[] = [];
    const bindings = new Map<string, TFile>();
    const expectedSources = new Map<string, string>();
    for (const item of snapshot.files) {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      if (!(file instanceof TFile)) {
        new Notice(translate("notice.undoConflict"));
        return;
      }
      const current = await this.app.vault.cachedRead(file);
      if (!this.fileBindingIsCurrent(file, item.path)) {
        new Notice(translate("notice.undoConflict"));
        return;
      }
      bindings.set(item.path, file);
      expectedSources.set(item.path, current);
      preflight.push({ file, path: item.path, before: current, after: item.before });
    }
    if (!(await this.synchronizeOpenMarkdownViews(expectedSources, bindings))) {
      new Notice(translate("notice.undoConflict"));
      return;
    }
    const verified: BoundBatchFile[] = [];
    for (const item of preflight) {
      if (!this.fileBindingIsCurrent(item.file, item.path)) {
        new Notice(translate("notice.undoConflict"));
        return;
      }
      const current = await this.app.vault.cachedRead(item.file);
      if (!this.fileBindingIsCurrent(item.file, item.path)) {
        new Notice(translate("notice.undoConflict"));
        return;
      }
      const snapshotFile = snapshot.files.find((candidate) => candidate.path === item.path);
      if (snapshotFile == null) {
        new Notice(translate("notice.undoConflict"));
        return;
      }
      const matchesAfter = await digestText(current) === snapshotFile.afterHash;
      if (current !== snapshotFile.before && !matchesAfter) {
        new Notice(translate("notice.undoConflict"));
        return;
      }
      verified.push({
        file: item.file,
        path: item.path,
        before: current,
        after: snapshotFile.before,
      });
    }
    const restored: BoundBatchFile[] = [];
    const remainingSources = new Map(verified.map((item) => [item.path, item.before] as const));
    try {
      for (const item of verified) {
        if (
          !this.bindingsAreCurrent(verified)
          || !this.openMarkdownViewsMatch(remainingSources, bindings)
        ) throw new BatchChangedError();
        if (item.before !== item.after) {
          try {
            await this.replaceBoundExactly(item, item.before, item.after);
            restored.push(item);
          } catch (error) {
            if (error instanceof BatchWriteUncertainError) restored.push(item);
            throw error;
          }
        }
        remainingSources.delete(item.path);
      }
      await this.persistence.setLastBatch(null);
      new Notice(translate("notice.undoDone", { count: restored.length }));
    } catch (error) {
      console.error("Number Suite batch restore failed", error);
      const rollbackFailures = await this.rollbackBoundExactly(restored);
      for (const rollbackError of rollbackFailures) {
        console.error("Number Suite restore rollback failed", rollbackError);
      }
      if (rollbackFailures.length === 0) {
        try {
          await this.persistence.setLastBatch(snapshot);
        } catch (persistenceError) {
          console.error("Number Suite could not retain the recovery snapshot", persistenceError);
        }
      }
      new Notice(translate(isBatchConflict(error)
        ? "notice.undoConflict"
        : "notice.batchFailed"));
    }
  }

  private filesForScope(scope: BatchScope): TFile[] {
    const settings = this.getSettings();
    return this.app.vault.getMarkdownFiles()
      .filter((file) => pathInFolder(file.path, scope.folder))
      .filter((file) => !isExcluded(file.path, settings.excludedFolders))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  private openMarkdownViews(): MarkdownView[] {
    const views: MarkdownView[] = [];
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file != null) {
        views.push(leaf.view);
      }
    });
    return views;
  }

  private async synchronizeOpenMarkdownViews(
    expectedSources?: ReadonlyMap<string, string>,
    expectedFiles?: ReadonlyMap<string, TFile>,
  ): Promise<boolean> {
    const initialViews = this.openMarkdownViews();
    if (expectedSources == null) {
      await Promise.all(initialViews.map(async (view) => view.save()));
      return true;
    }
    const relevantViews = initialViews.filter((view) => {
      const path = view.file?.path;
      return path != null && expectedSources.has(path);
    });
    const originalBindings = relevantViews.map((view) => ({
      view,
      path: view.file?.path ?? "",
      file: view.file,
      expected: expectedSources.get(view.file?.path ?? "") ?? "",
    }));
    if (!this.openMarkdownViewsMatch(expectedSources, expectedFiles, relevantViews)) return false;
    await Promise.all(relevantViews.map(async (view) => view.save()));
    const currentViews = this.openMarkdownViews();
    if (originalBindings.some(({ view, path, file, expected }) => (
      !currentViews.includes(view)
      || view.file !== file
      || view.file?.path !== path
      || view.editor.getValue() !== expected
    ))) return false;
    return this.openMarkdownViewsMatch(expectedSources, expectedFiles, currentViews);
  }

  private openMarkdownViewsMatch(
    expectedSources: ReadonlyMap<string, string>,
    expectedFiles?: ReadonlyMap<string, TFile>,
    views = this.openMarkdownViews(),
  ): boolean {
    return views.every((view) => {
      const path = view.file?.path;
      if (path == null || !expectedSources.has(path)) return true;
      const expected = expectedSources.get(path);
      const expectedFile = expectedFiles?.get(path);
      return expected != null
        && (expectedFile == null || view.file === expectedFile)
        && view.editor.getValue() === expected;
    });
  }

  private fileBindingIsCurrent(file: TFile, path: string): boolean {
    return file.path === path && this.app.vault.getAbstractFileByPath(path) === file;
  }

  private bindingsAreCurrent(files: readonly BoundBatchFile[]): boolean {
    return files.every((item) => this.fileBindingIsCurrent(item.file, item.path));
  }

  private async replaceBoundExactly(
    item: BoundBatchFile,
    expected: string,
    replacement: string,
  ): Promise<void> {
    if (!this.fileBindingIsCurrent(item.file, item.path)) throw new BatchChangedError();
    let replacementAccepted = false;
    try {
      await this.app.vault.process(item.file, (current) => {
        if (!this.fileBindingIsCurrent(item.file, item.path)) throw new BatchChangedError();
        if (current !== expected) throw new ContentConflictError(item.path);
        replacementAccepted = true;
        return replacement;
      });
    } catch (error) {
      if (replacementAccepted) throw new BatchWriteUncertainError(error);
      throw error;
    }
    if (!this.fileBindingIsCurrent(item.file, item.path)) {
      throw new BatchWriteUncertainError(new BatchChangedError(true));
    }
  }

  private async rollbackBoundExactly(
    replacements: readonly BoundBatchFile[],
  ): Promise<readonly unknown[]> {
    const failures: unknown[] = [];
    for (const item of [...replacements].reverse()) {
      try {
        await this.replaceBoundExactly(item, item.after, item.before);
      } catch (error) {
        failures.push(error);
      }
    }
    return failures;
  }

  private async preview(
    scope: BatchScope,
    operation: TransformOperation,
    translate: Translate,
  ): Promise<void> {
    await this.synchronizeOpenMarkdownViews();
    const documents: PreviewDocument[] = [];
    const candidates: Array<Readonly<{ path: string; source: string }>> = [];
    let invalidFrontmatter = 0;
    for (const file of this.filesForScope(scope)) {
      const source = await this.app.vault.cachedRead(file);
      const result = createSourcePlan(source, operation, this.getSettings());
      if (result.status === "invalid-frontmatter" || result.status === "invalid-properties") {
        invalidFrontmatter += 1;
      }
      if (result.status === "ready") candidates.push({ path: file.path, source });
      if (result.status === "ready" && result.plan != null && result.plan.changes.length > 0) {
        documents.push({ path: file.path, plan: result.plan });
      }
    }
    if (invalidFrontmatter > 0) {
      new Notice(translate("notice.batchSkippedInvalid", { count: invalidFrontmatter }));
    }
    if (documents.length === 0 && (operation !== "remove" && operation !== "renumber" || candidates.length === 0)) {
      new Notice(translate("notice.batchNone"));
      return;
    }
    new ChangePreviewModal({
      app: this.app,
      operation,
      documents,
      translate,
      ...(operation === "remove" || operation === "renumber" ? {
        cleanupScope: this.getSettings().cleanupScope,
        onCleanupScopeChange: (scope: import("../core/types").CleanupScope) => candidates.flatMap((candidate) => {
          const replanned = createSourcePlan(candidate.source, operation, this.getSettings(), scope);
          return replanned.status === "ready" && replanned.plan != null && replanned.plan.changes.length > 0
            ? [{ path: candidate.path, plan: replanned.plan }]
            : [];
        }),
      } : {}),
      onConfirm: async (selected = documents) => this.apply(selected, operation, translate),
    }).open();
  }

  private async apply(
    documents: readonly PreviewDocument[],
    operation: TransformOperation,
    translate: Translate,
  ): Promise<void> {
    await this.runExclusive(translate, async () => this.applyExclusive(documents, operation, translate));
  }

  private async applyExclusive(
    documents: readonly PreviewDocument[],
    operation: TransformOperation,
    translate: Translate,
  ): Promise<void> {
    const expectedSources = new Map(documents.map((document) => (
      [document.path, document.plan.source] as const
    )));
    const files: BoundBatchFile[] = [];
    const bindings = new Map<string, TFile>();
    const seen = new Set<string>();
    for (const document of documents) {
      if (seen.has(document.path)) {
        new Notice(translate("notice.batchChanged"));
        return;
      }
      seen.add(document.path);
      const file = this.app.vault.getAbstractFileByPath(document.path);
      if (!(file instanceof TFile)) {
        new Notice(translate("notice.batchChanged"));
        return;
      }
      bindings.set(document.path, file);
      files.push({
        file,
        path: document.path,
        before: document.plan.source,
        after: document.plan.result,
      });
    }
    if (
      !this.bindingsAreCurrent(files)
      || !(await this.synchronizeOpenMarkdownViews(expectedSources, bindings))
    ) {
      new Notice(translate("notice.batchChanged"));
      return;
    }
    for (const item of files) {
      if (!this.fileBindingIsCurrent(item.file, item.path)) {
        new Notice(translate("notice.batchChanged"));
        return;
      }
      const current = await this.app.vault.cachedRead(item.file);
      if (!this.fileBindingIsCurrent(item.file, item.path) || current !== item.before) {
        new Notice(translate("notice.batchChanged"));
        return;
      }
    }
    const pendingSnapshot: LastBatchSnapshot = {
      createdAt: new Date().toISOString(),
      operation,
      status: "pending",
      files: await Promise.all(files.map(async (item) => ({
        path: item.path,
        before: item.before,
        afterHash: await digestText(item.after),
      }))),
    };
    const limit = this.getSettings().batchBackupLimitMb;
    if (snapshotSizeBytes(pendingSnapshot) > limit * 1024 * 1024) {
      new Notice(translate("notice.batchTooLarge", { limit }));
      return;
    }
    const previousSnapshot = this.persistence.getLastBatch();
    const modified: BoundBatchFile[] = [];
    const remainingSources = new Map(expectedSources);
    try {
      await this.persistence.setLastBatch(pendingSnapshot);
      for (const item of files) {
        if (
          !this.bindingsAreCurrent(files)
          || !this.openMarkdownViewsMatch(remainingSources, bindings)
        ) throw new BatchChangedError();
        try {
          await this.replaceBoundExactly(item, item.before, item.after);
          modified.push(item);
        } catch (error) {
          if (error instanceof BatchWriteUncertainError) modified.push(item);
          throw error;
        }
        remainingSources.delete(item.path);
      }
      const appliedSnapshot: LastBatchSnapshot = {
        ...pendingSnapshot,
        status: "applied",
        files: pendingSnapshot.files.map((item) => ({ ...item })),
      };
      await this.persistence.setLastBatch(appliedSnapshot);
      new Notice(translate("notice.batchApplied", { count: modified.length }));
    } catch (error) {
      console.error("Number Suite batch failed", error);
      const rollbackFailures = await this.rollbackBoundExactly(modified);
      for (const rollbackError of rollbackFailures) {
        console.error("Number Suite batch rollback failed", rollbackError);
      }
      if (rollbackFailures.length === 0) {
        try {
          await this.persistence.setLastBatch(previousSnapshot);
        } catch (persistenceError) {
          console.error("Number Suite could not restore the previous recovery snapshot", persistenceError);
        }
      }
      new Notice(translate(isBatchConflict(error)
        ? "notice.batchChanged"
        : "notice.batchFailed"));
    }
  }
}
