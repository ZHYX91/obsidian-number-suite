import { App, Modal, Setting, type ButtonComponent } from "obsidian";

import type { Translate } from "../config/i18n";
import { WORD_JOINER } from "../core/markers";
import { planChangesSource } from "../core/transform";
import { applyModalDirection } from "./modal-direction";
import type { CleanupScope, TransformOperation, TransformPlan } from "../core/types";
import { changedTextParts, renderPreviewDifference } from "./preview-diff";

export interface PreviewDocument {
  path: string;
  plan: TransformPlan;
}

export type PreviewApplyResult = void | boolean | { readonly message: string; readonly stale: boolean };

export interface PreviewModalOptions {
  readonly signal?: AbortSignal;
  app: App;
  operation: TransformOperation;
  documents: readonly PreviewDocument[];
  translate: Translate;
  cleanupScope?: CleanupScope;
  onCleanupScopeChange?: (scope: CleanupScope) => readonly PreviewDocument[] | Promise<readonly PreviewDocument[]>;
  onConfirm: (documents: readonly PreviewDocument[]) => Promise<PreviewApplyResult>;
}

function visibleMarkers(value: string): string {
  return value.replace(new RegExp(WORD_JOINER, "gu"), "⟪WJ⟫");
}

const CHANGE_PAGE_SIZE = 500;
const WARNING_PAGE_SIZE = 200;

export class ChangePreviewPane {
  private applying = false;
  private replanning = false;
  private refreshScopePreview: (() => void) | null = null;
  private failure: string | null = null;
  private stale = false;
  private closed = false;
  private readonly abort = (): void => { this.applying = false; this.close(); };
  private documents: readonly PreviewDocument[];
  private cleanupScope: CleanupScope | null;
  private readonly visibleChangeLimits = new Map<string, number>();
  private readonly visibleWarningLimits = new Map<string, number>();
  private readonly expandedPaths = new Set<string>();

  constructor(
    private readonly options: PreviewModalOptions,
    private readonly contentEl: HTMLElement,
    private readonly titleEl: HTMLElement,
    private readonly modalEl: HTMLElement,
    private readonly onDismiss: () => void,
    private readonly batch?: { scope: string; checked: number; onBack: () => void },
  ) {
    this.documents = options.documents;
    this.cleanupScope = options.cleanupScope ?? null;
    if (this.documents[0] !== undefined) this.expandedPaths.add(this.documents[0].path);
  }

  onOpen(): void {
    if (this.options.signal?.aborted) { this.close(); return; }
    this.options.signal?.addEventListener("abort", this.abort, { once: true });
    this.render();
  }

  private render(focusFailure = false): void {
    if (this.closed || this.options.signal?.aborted) return;
    const { contentEl, titleEl } = this;
    const t = this.options.translate;
    const active = contentEl.ownerDocument.activeElement;
    const focusFeedback = focusFailure && (active === contentEl.ownerDocument.body || contentEl.contains(active));
    contentEl.empty();
    titleEl.setText(t(`preview.title.${this.options.operation}`));
    contentEl.addClass("number-suite-preview");
    if (this.batch) {
      const scope = contentEl.createDiv({ cls: "number-suite-batch-scope" });
      scope.createSpan({ text: t("batch.scope.label") });
      scope.createEl("bdi", { text: this.batch.scope });
    }
    const feedback = this.failure == null ? null : contentEl.createDiv({
      cls: "number-suite-note-control-error", text: this.failure, attr: { role: "alert", tabindex: "-1" },
    });
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
    const summary = contentEl.createEl("p", { cls: "number-suite-preview-summary" });
    contentEl.createEl("p", {
      cls: "number-suite-preview-risk",
      text: t("preview.warningLinks"),
    });

    const documents = contentEl.createDiv({ cls: "number-suite-preview-documents" });
    const actions = new Setting(contentEl);
    actions.settingEl.addClass("number-suite-preview-actions");
    const batch = this.batch;
    let confirm: ButtonComponent | undefined;
    let canApply = false;
    this.refreshScopePreview = () => {
      const changes = this.documents.reduce((sum, document) => sum + document.plan.changes.length, 0);
      const warnings = this.documents.reduce((sum, document) => sum + document.plan.warnings.length, 0);
      const files = batch ? this.documents.filter(({ plan }) => planChangesSource(plan)).length : 0;
      summary.setText(batch ? t("batch.summary", { checked: batch.checked, files, changes, warnings })
        : t("preview.summary", { changes, warnings }));
      canApply = !this.stale && (batch ? files > 0 : changes > 0);
      confirm?.setButtonText(batch ? t("batch.confirm", { files }) : t("preview.confirm")).setDisabled(!canApply);
      const activeWasInResults = documents.contains(contentEl.ownerDocument.activeElement);
      documents.empty();
      for (const document of this.documents) this.renderDocument(documents, document);
      if (activeWasInResults) contentEl.querySelector("select")?.focus({ preventScroll: true });
    };
    if (batch) actions.addButton((button) => button.setButtonText(t("batch.back")).onClick(() => {
      if (!this.closed && !this.applying) batch.onBack();
    }));
    actions.addButton((button) => button
      .setButtonText(t("preview.cancel"))
      .onClick(() => this.close()));
    actions.addButton((button) => {
      button.setCta();
      confirm = button;
      if (this.options.operation === "remove") {
        button.setWarning();
      }
      button.onClick(() => {
        if (!canApply || this.closed || this.options.signal?.aborted || this.applying || this.replanning) return;
        this.applying = true;
        for (const control of this.contentEl.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input, button, select")) {
          control.disabled = true;
        }
        button.setButtonText(t("preview.applying"));
        void this.options.onConfirm(this.documents)
          .then((applied) => {
            this.applying = false;
            if (applied === false || typeof applied === "object") {
              this.stale = applied === false || applied.stale;
              this.failure = applied === false ? t("notice.stalePreview") : applied.message;
              this.render(true);
            } else {
              this.close();
            }
          })
          .catch((error: unknown) => {
            this.applying = false;
            this.failure = t("preview.applyFailed");
            this.render(true);
            console.error("Number Suite preview apply failed", error);
          });
      });
    });
    this.refreshScopePreview();
    applyModalDirection(this.modalEl, t);
    if (focusFeedback) feedback?.focus();
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
      const pages = <T>(
        items: readonly T[], size: number, limits: Map<string, number>,
        label: "preview.moreChanges" | "preview.moreWarnings", append: (item: T) => HTMLElement,
      ): void => {
        let count = Math.min(limits.get(document.path) ?? size, items.length);
        items.slice(0, count).forEach(append);
        if (count === items.length) return;
        const moreText = (): string => t(label, { count: items.length - count });
        const button = body.createEl("button", {
          text: moreText(), cls: "number-suite-preview-more", attr: { type: "button" },
        });
        button.addEventListener("click", () => {
          const next = Math.min(count + size, items.length);
          const first = append(items[count]!);
          for (let index = count + 1; index < next; index++) append(items[index]!);
          count = next;
          limits.set(document.path, count);
          if (count === items.length) button.remove();
          else button.setText(moreText());
          first.tabIndex = -1;
          first.focus();
        });
      };

      const cards = body.createDiv();
      pages(document.plan.changes, CHANGE_PAGE_SIZE, this.visibleChangeLimits, "preview.moreChanges", (change) => {
        const card = cards.createDiv({ cls: "number-suite-change" });
        card.dataset.ruleId = change.ruleId;
        card.createDiv({ cls: "number-suite-change-meta", text: t("preview.line", { line: change.line + 1, level: change.level }) });
        const parts = changedTextParts(visibleMarkers(change.before), visibleMarkers(change.after));
        const before = card.createDiv({ cls: "number-suite-diff number-suite-diff-before" });
        before.createEl("strong", { text: `${t("preview.before")}: ` });
        renderPreviewDifference(before, parts.prefix, parts.before, parts.suffix);
        const after = card.createDiv({ cls: "number-suite-diff number-suite-diff-after" });
        after.createEl("strong", { text: `${t("preview.after")}: ` });
        renderPreviewDifference(after, parts.prefix, parts.after, parts.suffix);
        return card;
      });
      if (document.plan.warnings.length > 0) {
        body.createEl("h3", { text: t("preview.warnings") });
        const list = body.createEl("ul", { cls: "number-suite-warning-list" });
        pages(document.plan.warnings, WARNING_PAGE_SIZE, this.visibleWarningLimits, "preview.moreWarnings",
          (warning) => list.createEl("li", {
            text: `${document.path}:${warning.line + 1} — ${t(`preview.warning.${warning.code}`)}`,
          }));
      }
    };
    if (section.open) renderBody();
    section.addEventListener("toggle", () => {
      if (section.open) { this.expandedPaths.add(document.path); if (!body.hasChildNodes()) renderBody(); }
      else { this.expandedPaths.delete(document.path); body.empty(); }
    });
  }

  private async changeCleanupScope(scope: CleanupScope): Promise<void> {
    if (this.closed || this.options.signal?.aborted || this.applying || this.replanning || this.options.onCleanupScopeChange == null || scope === this.cleanupScope) return;
    this.replanning = true;
    const select = this.contentEl.querySelector("select")!;
    const apply = this.contentEl.querySelector<HTMLButtonElement>(".number-suite-preview-actions button:last-child")!;
    const wasDisabled = apply.disabled;
    const owner = this.contentEl.ownerDocument;
    const ownedFocus = owner.activeElement === select;
    this.contentEl.setAttribute("aria-busy", "true");
    select.disabled = true;
    apply.disabled = true;
    this.contentEl.querySelector(".number-suite-replan-error")?.remove();
    try {
      const documents = await this.options.onCleanupScopeChange(scope);
      if (this.closed || this.options.signal?.aborted) return;
      this.documents = documents;
      this.cleanupScope = scope;
      this.visibleChangeLimits.clear();
      this.visibleWarningLimits.clear();
      select.disabled = false;
      this.refreshScopePreview?.();
    } catch (error: unknown) {
      if (this.closed || this.options.signal?.aborted) return;
      select.value = this.cleanupScope ?? "templates";
      apply.disabled = wasDisabled;
      const message = this.contentEl.createDiv({
        cls: "number-suite-note-control-error number-suite-replan-error",
        text: this.options.translate("preview.scopeFailed"), attr: { role: "alert" },
      });
      select.closest(".setting-item")?.after(message);
      console.error("Number Suite preview replanning failed", error);
    } finally {
      this.replanning = false;
      if (!this.closed && !this.options.signal?.aborted) {
        this.contentEl.removeAttribute("aria-busy");
        select.disabled = false;
        if (ownedFocus && owner.activeElement === owner.body) select.focus({ preventScroll: true });
      }
    }
  }

  close(): void {
    if (this.applying || this.closed) return;
    this.onClose();
    this.onDismiss();
  }

  canClose(): boolean { return !this.applying; }

  onClose(): void {
    this.closed = true;
    this.refreshScopePreview = null;
    this.contentEl.removeAttribute("aria-busy");
    this.options.signal?.removeEventListener("abort", this.abort);
    this.modalEl.removeClass("number-suite-preview-modal");
    this.contentEl.empty();
  }
}

export class ChangePreviewModal extends Modal {
  private pane: ChangePreviewPane | null = null;
  constructor(private readonly options: PreviewModalOptions) { super(options.app); }
  override onOpen(): void {
    this.modalEl.addClass("number-suite-preview-modal");
    this.pane = new ChangePreviewPane(this.options, this.contentEl, this.titleEl, this.modalEl, () => super.close());
    this.pane.onOpen();
  }
  override onClose(): void { this.pane?.onClose(); this.pane = null; }
  override close(): void { if (this.pane?.canClose() !== false) super.close(); }
}
