import { App, FuzzySuggestModal, Modal, TFolder } from "obsidian";

import type { Translate } from "../config/i18n";
import { applyModalDirection } from "./modal-direction";
import type { TransformOperation } from "../core/types";
import { ChangePreviewPane, type PreviewModalOptions } from "./preview-modal";

export interface BatchScope {
  folder: TFolder | null;
  label: string;
}

export interface BatchPreview extends PreviewModalOptions {
  checkedCount: number;
}

export class FolderScopeModal extends FuzzySuggestModal<BatchScope> {
  constructor(
    app: App,
    translate: Translate,
    private readonly choose: (scope: BatchScope) => void,
    private readonly dismiss: () => void,
  ) {
    super(app);
    this.setPlaceholder(translate("batch.scope.title"));
    applyModalDirection(this.modalEl, translate);
  }

  override getItems(): BatchScope[] {
    return this.app.vault.getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .filter((folder) => folder.path.length > 0 && folder.path !== "/")
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((folder) => ({ folder, label: folder.path }));
  }

  override getItemText(item: BatchScope): string {
    return item.label;
  }

  override onChooseItem(item: BatchScope): void {
    this.choose(item);
  }

  override onClose(): void {
    super.onClose();
    this.dismiss();
  }
}

const operations = {
  write: "batch.operation.write",
  remove: "batch.operation.remove",
  renumber: "batch.operation.renumber",
  "strip-markers": "batch.operation.strip",
} as const satisfies Record<TransformOperation, Parameters<Translate>[0]>;

export class BatchModal extends Modal {
  private scopeChoice: BatchScope | null = null;
  private operation: TransformOperation | null = null;
  private picker: FolderScopeModal | null = null;
  private pane: ChangePreviewPane | null = null;
  private readonly session = new AbortController();
  private readonly unload = (): void => super.close();

  constructor(
    app: App,
    private readonly translate: Translate,
    private readonly owner: AbortSignal,
    private readonly prepare: (scope: BatchScope, operation: TransformOperation, signal: AbortSignal) => Promise<BatchPreview | null>,
  ) {
    super(app);
  }

  override onOpen(): void {
    if (this.owner.aborted) { this.close(); return; }
    this.owner.addEventListener("abort", this.unload, { once: true });
    this.modalEl.addClass("number-suite-batch-modal");
    this.renderSetup();
  }

  private renderSetup(): void {
    const t = this.translate;
    this.contentEl.empty();
    this.contentEl.removeClass("number-suite-preview");
    this.titleEl.setText(t("command.batch.folder"));
    const fields = this.contentEl.createDiv({ cls: "number-suite-batch-fields" });
    const scopeField = fields.createDiv({ attr: { role: "group", "aria-label": t("batch.scope.label") } });
    scopeField.createDiv({ text: t("batch.scope.label") });
    const choices = scopeField.createDiv({ cls: "number-suite-batch-choices" });
    const scopeButton = choices.createEl("button", { attr: { type: "button", "aria-haspopup": "dialog" } });
    const root = choices.createEl("button", { text: t("batch.scope.root"), attr: { type: "button" } });
    const operationField = fields.createEl("label", { text: t("batch.operation.title") });
    const select = operationField.createEl("select", { cls: "dropdown" });
    select.createEl("option", { text: "—", attr: { value: "" } }).disabled = true;
    for (const [value, label] of Object.entries(operations)) select.createEl("option", { text: t(label), attr: { value } });
    select.value = this.operation ?? "";
    const actions = this.contentEl.createDiv({ cls: "number-suite-batch-actions" });
    actions.createEl("button", { text: t("preview.cancel"), attr: { type: "button" } })
      .addEventListener("click", () => this.close());
    const preview = actions.createEl("button", { text: t("batch.preview"), cls: "mod-cta", attr: { type: "button" } });
    const update = (): void => {
      const choice = this.scopeChoice;
      const label = choice?.folder ? `${choice.label}/` : t("batch.scope.title");
      scopeButton.setText(label);
      scopeButton.dir = choice?.folder ? "auto" : this.modalEl.dir;
      scopeButton.setAttribute("aria-pressed", String(choice?.folder != null));
      root.setAttribute("aria-pressed", String(choice?.folder === null));
      preview.disabled = !choice || !this.operation;
    };
    scopeButton.addEventListener("click", () => {
      this.picker = new FolderScopeModal(this.app, t, (scope) => {
        if (this.session.signal.aborted) return;
        this.scopeChoice = scope;
        update();
        scopeButton.focus();
      }, () => { this.picker = null; });
      this.picker.open();
    });
    root.addEventListener("click", () => {
      this.scopeChoice = { folder: null, label: t("batch.scope.root") };
      update();
    });
    select.addEventListener("change", () => {
      this.operation = select.value as TransformOperation;
      update();
    });
    preview.addEventListener("click", () => {
      if (preview.disabled || !this.scopeChoice || !this.operation) return;
      for (const control of [scopeButton, root, select, preview]) control.disabled = true;
      preview.setText(t("batch.scanning"));
      void this.showPreview(this.scopeChoice, this.operation);
    });
    applyModalDirection(this.modalEl, t);
    update();
    scopeButton.focus();
  }

  private async showPreview(scope: BatchScope, operation: TransformOperation): Promise<void> {
    const t = this.translate;
    const signal = this.session.signal;
    try {
      const preview = await this.prepare(scope, operation, signal);
      if (signal.aborted) return;
      if (!preview) { this.renderSetup(); return; }
      this.pane = new ChangePreviewPane(preview, this.contentEl, this.titleEl, this.modalEl, () => this.close(), {
        scope: scope.folder ? `${scope.label}/` : scope.label, checked: preview.checkedCount,
        onBack: () => {
          this.pane?.onClose();
          this.pane = null;
          this.renderSetup();
        },
      });
      this.pane.onOpen();
      this.titleEl.tabIndex = -1;
      this.titleEl.focus();
    } catch (error) {
      if (signal.aborted) return;
      console.error("Number Suite batch preview failed", error);
      this.renderSetup();
      this.contentEl.createDiv({ text: t("notice.batchFailed"), attr: { role: "alert" } });
    }
  }

  override close(): void { if (this.pane?.canClose() !== false) super.close(); }

  override onClose(): void {
    this.session.abort();
    this.owner.removeEventListener("abort", this.unload);
    this.picker?.close();
    this.picker = null;
    this.pane?.onClose();
    this.pane = null;
    this.contentEl.empty();
  }
}
