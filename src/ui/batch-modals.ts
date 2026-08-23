import { App, FuzzySuggestModal, Modal, Setting, TFolder } from "obsidian";

import type { Translate } from "../config/i18n";
import type { TransformOperation } from "../core/types";

export interface BatchScope {
  folder: TFolder | null;
  label: string;
}

export class FolderScopeModal extends FuzzySuggestModal<BatchScope> {
  constructor(
    app: App,
    private readonly translate: Translate,
    private readonly choose: (scope: BatchScope) => void,
  ) {
    super(app);
    this.setPlaceholder(translate("batch.scope.title"));
  }

  override getItems(): BatchScope[] {
    const root: BatchScope = { folder: null, label: this.translate("batch.scope.root") };
    const folders = this.app.vault.getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .filter((folder) => folder.path.length > 0 && folder.path !== "/")
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((folder) => ({ folder, label: folder.path }));
    return [root, ...folders];
  }

  override getItemText(item: BatchScope): string {
    return item.label;
  }

  override onChooseItem(item: BatchScope): void {
    this.choose(item);
  }
}

export class BatchOperationModal extends Modal {
  constructor(
    app: App,
    private readonly translate: Translate,
    private readonly fileCount: number,
    private readonly choose: (operation: TransformOperation) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    const t = this.translate;
    this.titleEl.setText(t("batch.operation.title"));
    this.contentEl.createEl("p", { text: t("batch.fileCount", { count: this.fileCount }) });
    const operations: ReadonlyArray<readonly [TransformOperation, Parameters<Translate>[0]]> = [
      ["write", "batch.operation.write"],
      ["remove", "batch.operation.remove"],
      ["renumber", "batch.operation.renumber"],
      ["strip-markers", "batch.operation.strip"],
    ];
    for (const [operation, label] of operations) {
      new Setting(this.contentEl)
        .setName(t(label))
        .addButton((button) => button
          .setButtonText(t(label))
          .onClick(() => {
            this.close();
            this.choose(operation);
          }));
    }
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
