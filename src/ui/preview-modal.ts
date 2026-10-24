import { App, Modal, Setting } from "obsidian";

import type { Translate } from "../config/i18n";
import { WORD_JOINER } from "../core/markers";
import { applyModalDirection } from "./modal-direction";
import type { CleanupScope, TransformOperation, TransformPlan } from "../core/types";
import { changedTextParts, renderPreviewDifference } from "./preview-diff";

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

const CHANGE_PAGE_SIZE = 500;
const WARNING_PAGE_SIZE = 200;

export class ChangePreviewModal extends Modal {
  private applying = false;
  private documents: readonly PreviewDocument[];
  private cleanupScope: CleanupScope | null;
  private readonly visibleChangeLimits = new Map<string, number>();
  private readonly visibleWarningLimits = new Map<string, number>();
  private readonly expandedPaths = new Set<string>();

  constructor(private readonly options: PreviewModalOptions) {
    super(options.app);
    this.documents = options.documents;
    this.cleanupScope = options.cleanupScope ?? null;
    if (this.documents[0] !== undefined) this.expandedPaths.add(this.documents[0].path);
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

    for (const document of this.documents) {
      this.renderDocument(contentEl, document);
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
        if (this.applying) return;
        this.applying = true;
        for (const control of this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input, button, select")) {
          control.disabled = true;
        }
        button.setButtonText(t("preview.applying"));
        void this.options.onConfirm(this.documents)
          .then(() => { this.applying = false; this.close(); })
          .catch((error: unknown) => {
            this.applying = false;
            this.render();
            console.error("Number Suite preview apply failed", error);
          });
      });
    });
    applyModalDirection(this.modalEl, t);
  }

  private renderDocument(container: HTMLElement, document: PreviewDocument): void {
    const t = this.options.translate;
    const section = container.createEl("details", { cls: "number-suite-preview-document" });
    section.open = this.expandedPaths.has(document.path);
    const summary = section.createEl("summary");
    summary.createSpan({ text: document.path, cls: "number-suite-preview-path", attr: { dir: "auto" } });
    summary.createSpan({ cls: "number-suite-preview-count", text: t("preview.summary", {
      changes: document.plan.changes.length, warnings: document.plan.warnings.length,
    }) });
    const body = section.createDiv();
    const renderBody = (): void => {
      body.empty();
      const changeLimit = this.visibleChangeLimits.get(document.path) ?? CHANGE_PAGE_SIZE;
      for (const change of document.plan.changes.slice(0, changeLimit)) {
        const card = body.createDiv({ cls: "number-suite-change" });
        card.dataset.ruleId = change.ruleId;
        card.createDiv({ cls: "number-suite-change-meta", text: t("preview.line", { line: change.line + 1, level: change.level }) });
        const parts = changedTextParts(visibleMarkers(change.before), visibleMarkers(change.after));
        const before = card.createDiv({ cls: "number-suite-diff number-suite-diff-before" });
        before.createEl("strong", { text: `${t("preview.before")}: ` });
        renderPreviewDifference(before, parts.prefix, parts.before, parts.suffix);
        const after = card.createDiv({ cls: "number-suite-diff number-suite-diff-after" });
        after.createEl("strong", { text: `${t("preview.after")}: ` });
        renderPreviewDifference(after, parts.prefix, parts.after, parts.suffix);
      }
      const more = (label: string, reveal: () => void): void => {
        const button = body.createEl("button", { text: label, cls: "number-suite-preview-more", attr: { type: "button" } });
        button.addEventListener("click", () => { reveal(); renderBody(); summary.focus(); });
      };
      if (document.plan.changes.length > changeLimit) more(t("preview.moreChanges", { count: document.plan.changes.length - changeLimit }),
        () => this.visibleChangeLimits.set(document.path, changeLimit + CHANGE_PAGE_SIZE));
      const warningLimit = this.visibleWarningLimits.get(document.path) ?? WARNING_PAGE_SIZE;
      if (document.plan.warnings.length > 0) {
        body.createEl("h3", { text: t("preview.warnings") });
        const list = body.createEl("ul", { cls: "number-suite-warning-list" });
        for (const warning of document.plan.warnings.slice(0, warningLimit)) list.createEl("li", {
          text: `${document.path}:${warning.line + 1} — ${t(`preview.warning.${warning.code}`)}`,
        });
        if (document.plan.warnings.length > warningLimit) more(t("preview.moreWarnings", { count: document.plan.warnings.length - warningLimit }),
          () => this.visibleWarningLimits.set(document.path, warningLimit + WARNING_PAGE_SIZE));
      }
      applyModalDirection(this.modalEl, t);
    };
    if (section.open) renderBody();
    section.addEventListener("toggle", () => {
      if (section.open) { this.expandedPaths.add(document.path); if (!body.hasChildNodes()) renderBody(); }
      else { this.expandedPaths.delete(document.path); body.empty(); }
    });
  }

  private async changeCleanupScope(scope: CleanupScope): Promise<void> {
    if (this.applying || this.options.onCleanupScopeChange == null || scope === this.cleanupScope) return;
    this.applying = true;
    try {
      this.documents = await this.options.onCleanupScopeChange(scope);
      this.cleanupScope = scope;
      this.visibleChangeLimits.clear();
      this.visibleWarningLimits.clear();
      this.applying = false;
      this.render();
    } catch (error: unknown) {
      this.applying = false;
      console.error("Number Suite preview replanning failed", error);
    }
  }

  override close(): void {
    if (this.applying) return;
    super.close();
  }

  override onClose(): void {
    this.modalEl.removeClass("number-suite-preview-modal");
    this.contentEl.empty();
  }
}
