import { App, Modal, Setting } from "obsidian";

import type { Translate } from "../config/i18n";
import { WORD_JOINER } from "../core/markers";
import type { CleanupScope, TransformOperation, TransformPlan } from "../core/types";

export interface PreviewDocument {
  path: string;
  plan: TransformPlan;
}

export interface PreviewModalOptions {
  app: App;
  operation: TransformOperation;
  documents: readonly PreviewDocument[];
  translate: Translate;
  cleanupScope?: CleanupScope;
  onCleanupScopeChange?: (scope: CleanupScope) => readonly PreviewDocument[] | Promise<readonly PreviewDocument[]>;
  onConfirm: (documents: readonly PreviewDocument[]) => Promise<void>;
}

function visibleMarkers(value: string): string {
  return value.replace(new RegExp(WORD_JOINER, "gu"), "⟪WJ⟫");
}

export class ChangePreviewModal extends Modal {
  private applying = false;
  private documents: readonly PreviewDocument[];
  private cleanupScope: CleanupScope | null;

  constructor(private readonly options: PreviewModalOptions) {
    super(options.app);
    this.documents = options.documents;
    this.cleanupScope = options.cleanupScope ?? null;
  }

  override onOpen(): void {
    this.render();
  }

  private render(): void {
    const { contentEl, titleEl } = this;
    const t = this.options.translate;
    contentEl.empty();
    this.modalEl.addClass("number-suite-preview-modal");
    titleEl.setText(t(`preview.title.${this.options.operation}`));
    contentEl.addClass("number-suite-preview");
    if (this.cleanupScope != null && this.options.onCleanupScopeChange != null) {
      new Setting(contentEl)
        .setName(t("preview.cleanupScope"))
        .setDesc(t("preview.cleanupScope.desc"))
        .addDropdown((dropdown) => dropdown
          .addOption("plugin", t("cleanup.plugin"))
          .addOption("templates", t("cleanup.templates"))
          .addOption("common", t("cleanup.common"))
          .setValue(this.cleanupScope ?? "templates")
          .onChange((value) => void this.changeCleanupScope(value as CleanupScope)));
    }
    const changes = this.documents.reduce((sum, document) => sum + document.plan.changes.length, 0);
    const warnings = this.documents.reduce((sum, document) => sum + document.plan.warnings.length, 0);
    contentEl.createEl("p", {
      cls: "number-suite-preview-summary",
      text: t("preview.summary", { changes, warnings }),
    });
    contentEl.createEl("p", {
      cls: "number-suite-preview-risk",
      text: t("preview.warningLinks"),
    });

    let renderedChanges = 0;
    for (const document of this.documents) {
      if (this.documents.length > 1) {
        contentEl.createEl("h3", { text: document.path });
      }
      for (const change of document.plan.changes) {
        if (renderedChanges >= 500) {
          break;
        }
        renderedChanges += 1;
        const card = contentEl.createDiv({ cls: "number-suite-change" });
        card.createDiv({
          cls: "number-suite-change-meta",
          text: t("preview.line", { line: change.line + 1, level: change.level }),
        });
        card.createDiv({
          cls: "number-suite-change-rule",
          text: t("preview.rule", { rule: change.ruleId }),
        });
        const before = card.createDiv({ cls: "number-suite-diff number-suite-diff-before" });
        before.createEl("strong", { text: `${t("preview.before")}: ` });
        before.createEl("code", { text: visibleMarkers(change.before) });
        const after = card.createDiv({ cls: "number-suite-diff number-suite-diff-after" });
        after.createEl("strong", { text: `${t("preview.after")}: ` });
        after.createEl("code", { text: visibleMarkers(change.after) });
      }
    }
    if (renderedChanges < changes) {
      contentEl.createEl("p", {
        text: t("preview.moreChanges", { count: changes - renderedChanges }),
      });
    }

    const warningEntries = this.documents.flatMap((document) => (
      document.plan.warnings.map((warning) => ({ path: document.path, warning }))
    ));
    if (warningEntries.length > 0) {
      contentEl.createEl("h3", { text: t("preview.warnings") });
      const list = contentEl.createEl("ul", { cls: "number-suite-warning-list" });
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
      button.setDisabled(changes === 0);
      if (this.options.operation === "remove") {
        button.setWarning();
      }
      button.onClick(() => {
        if (this.applying) {
          return;
        }
        this.applying = true;
        button.setDisabled(true);
        void this.options.onConfirm(this.documents)
          .then(() => this.close())
          .catch((error: unknown) => {
            this.applying = false;
            button.setDisabled(false);
            console.error("Number Suite preview apply failed", error);
          });
      });
    });
  }

  private async changeCleanupScope(scope: CleanupScope): Promise<void> {
    if (this.applying || this.options.onCleanupScopeChange == null || scope === this.cleanupScope) return;
    this.applying = true;
    try {
      this.documents = await this.options.onCleanupScopeChange(scope);
      this.cleanupScope = scope;
      this.applying = false;
      this.render();
    } catch (error: unknown) {
      this.applying = false;
      console.error("Number Suite preview replanning failed", error);
    }
  }

  override onClose(): void {
    this.modalEl.removeClass("number-suite-preview-modal");
    this.contentEl.empty();
  }
}
