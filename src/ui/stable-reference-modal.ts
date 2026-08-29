import { App, Modal, Setting, type ButtonComponent } from "obsidian";

import type { Translate } from "../config/i18n";
import type { StableReferencePlan } from "../core/stable-reference";

export interface StableReferenceModalOptions {
  readonly app: App;
  readonly plan: StableReferencePlan;
  readonly translate: Translate;
  readonly onConfirm: () => Promise<void>;
}

export class StableReferenceModal extends Modal {
  private applying = false;

  constructor(private readonly options: StableReferenceModalOptions) {
    super(options.app);
  }

  override onOpen(): void {
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
        if (this.applying) return;
        this.applying = true;
        confirmButton?.setDisabled(true);
        void this.options.onConfirm()
          .then(() => this.close())
          .catch((error: unknown) => {
            this.applying = false;
            confirmButton?.setDisabled(false);
            console.error("Number Suite stable-reference creation failed", error);
          });
      });
    });
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}
