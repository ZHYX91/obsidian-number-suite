import { App, Modal, Setting } from "obsidian";

import type { Translate } from "../config/i18n";
import { WORD_JOINER } from "../core/markers";
import type { TransformOperation, TransformPlan } from "../core/types";

export interface PreviewDocument {
  path: string;
  plan: TransformPlan;
}

export interface PreviewModalOptions {
  app: App;
  operation: TransformOperation;
  documents: readonly PreviewDocument[];
  translate: Translate;
  onConfirm: () => Promise<void>;
}

function visibleMarkers(value: string): string {
  return value.replace(new RegExp(WORD_JOINER, "gu"), "⟪WJ⟫");
}

export class ChangePreviewModal extends Modal {
  private applying = false;

  constructor(private readonly options: PreviewModalOptions) {
    super(options.app);
  }

  override onOpen(): void {
    const { contentEl, titleEl } = this;
    const t = this.options.translate;
    this.modalEl.addClass("structured-numbering-preview-modal");
    titleEl.setText(t(`preview.title.${this.options.operation}`));
    contentEl.addClass("structured-numbering-preview");
    const changes = this.options.documents.reduce((sum, document) => sum + document.plan.changes.length, 0);
    const warnings = this.options.documents.reduce((sum, document) => sum + document.plan.warnings.length, 0);
    contentEl.createEl("p", {
      cls: "structured-numbering-preview-summary",
      text: t("preview.summary", { changes, warnings }),
    });
    contentEl.createEl("p", {
      cls: "structured-numbering-preview-risk",
      text: t("preview.warningLinks"),
    });

    let renderedChanges = 0;
    for (const document of this.options.documents) {
      if (this.options.documents.length > 1) {
        contentEl.createEl("h3", { text: document.path });
      }
      for (const change of document.plan.changes) {
        if (renderedChanges >= 500) {
          break;
        }
        renderedChanges += 1;
        const card = contentEl.createDiv({ cls: "structured-numbering-change" });
        card.createDiv({
          cls: "structured-numbering-change-meta",
          text: t("preview.line", { line: change.line + 1, level: change.level }),
        });
        card.createDiv({
          cls: "structured-numbering-change-rule",
          text: t("preview.rule", { rule: change.ruleId }),
        });
        const before = card.createDiv({ cls: "structured-numbering-diff structured-numbering-diff-before" });
        before.createEl("strong", { text: `${t("preview.before")}: ` });
        before.createEl("code", { text: visibleMarkers(change.before) });
        const after = card.createDiv({ cls: "structured-numbering-diff structured-numbering-diff-after" });
        after.createEl("strong", { text: `${t("preview.after")}: ` });
        after.createEl("code", { text: visibleMarkers(change.after) });
      }
    }
    if (renderedChanges < changes) {
      contentEl.createEl("p", {
        text: t("preview.moreChanges", { count: changes - renderedChanges }),
      });
    }

    const warningEntries = this.options.documents.flatMap((document) => (
      document.plan.warnings.map((warning) => ({ path: document.path, warning }))
    ));
    if (warningEntries.length > 0) {
      contentEl.createEl("h3", { text: t("preview.warnings") });
      const list = contentEl.createEl("ul", { cls: "structured-numbering-warning-list" });
      for (const entry of warningEntries.slice(0, 200)) {
        list.createEl("li", {
          text: `${entry.path}:${entry.warning.line + 1} — ${entry.warning.detail}`,
        });
      }
    }

    const actions = new Setting(contentEl);
    actions.addButton((button) => button
      .setButtonText(t("preview.cancel"))
      .onClick(() => this.close()));
    actions.addButton((button) => {
      button.setButtonText(t("preview.confirm")).setCta();
      if (this.options.operation === "remove") {
        button.setDestructive();
      }
      button.onClick(() => {
        if (this.applying) {
          return;
        }
        this.applying = true;
        button.setDisabled(true);
        void this.options.onConfirm()
          .then(() => this.close())
          .catch((error: unknown) => {
            this.applying = false;
            button.setDisabled(false);
            console.error("Structured Numbering preview apply failed", error);
          });
      });
    });
  }

  override onClose(): void {
    this.modalEl.removeClass("structured-numbering-preview-modal");
    this.contentEl.empty();
  }
}
