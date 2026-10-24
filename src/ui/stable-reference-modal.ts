import { App, Modal, Setting, type ButtonComponent } from "obsidian";

import type { Translate } from "../config/i18n";
import { applyModalDirection } from "./modal-direction";
import type { StableReferencePlan } from "../core/stable-reference";

export interface StableReferenceModalOptions {
  readonly signal?: AbortSignal;
  readonly app: App;
  readonly plan: StableReferencePlan;
  readonly translate: Translate;
  readonly onConfirm: () => Promise<void>;
}

export class StableReferenceModal extends Modal {
  private applying = false;
  private closed = false;
  private readonly abort = (): void => { this.applying = false; this.close(); };

  constructor(private readonly options: StableReferenceModalOptions) {
    super(options.app);
  }

  override onOpen(): void {
    if (this.options.signal?.aborted) { this.close(); return; }
    this.options.signal?.addEventListener("abort", this.abort, { once: true });
    const { contentEl, titleEl } = this;
    const { plan, translate: t } = this.options;
    titleEl.setText(t("reference.modal.title"));
    contentEl.createEl("p", { text: t("reference.modal.description") });
    const preview = contentEl.createDiv({ cls: "number-suite-stable-reference-preview" });
    preview.createEl("strong", { text: t("reference.modal.preview") });
    const before = preview.createDiv({ cls: "number-suite-diff number-suite-diff-before" });
    before.createEl("strong", { text: `${t("preview.before")}: ` });
    before.createEl("code", { text: plan.change?.before ?? "" });
    const after = preview.createDiv({ cls: "number-suite-diff number-suite-diff-after" });
    after.createEl("strong", { text: `${t("preview.after")}: ` });
    after.createEl("code", { text: plan.change?.after ?? "" });
    const link = preview.createEl("p");
    link.createEl("strong", { text: `${t("reference.modal.link")}: ` });
    link.createEl("code", { text: plan.link });

    let confirmButton: ButtonComponent | null = null;
    const actions = new Setting(contentEl);
    actions.addButton((button) => button
      .setButtonText(t("preview.cancel"))
      .onClick(() => this.close()));
    actions.addButton((button) => {
      confirmButton = button;
      button.setButtonText(t("reference.modal.confirm")).setCta().onClick(() => {
        if (this.closed || this.options.signal?.aborted || this.applying) return;
        this.applying = true;
        confirmButton?.setDisabled(true);
        void this.options.onConfirm()
          .then(() => this.close())
          .catch((error: unknown) => {
            this.applying = false;
            if (this.closed) return;
            confirmButton?.setDisabled(false);
            console.error("Number Suite stable-reference creation failed", error);
          });
      });
    });
    applyModalDirection(this.modalEl, t);
  }

  override onClose(): void {
    this.closed = true;
    this.options.signal?.removeEventListener("abort", this.abort);
    this.contentEl.empty();
  }
}
