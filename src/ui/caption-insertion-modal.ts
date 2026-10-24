import { App, Modal, Setting, type ButtonComponent } from "obsidian";

import type { Translate } from "../config/i18n";
import { applyModalDirection } from "./modal-direction";
import {
  formatCaptionInsertionSource,
  type CaptionInsertionAction,
  type CaptionInsertionTarget,
} from "../core/caption-insertion";

export interface CaptionInsertionModalOptions {
  readonly signal?: AbortSignal;
  readonly app: App;
  readonly target: CaptionInsertionTarget;
  readonly translate: Translate;
  readonly onConfirm: (title: string) => Promise<boolean | void>;
  readonly onApplied?: () => void;
}

function kindLabel(target: CaptionInsertionTarget, t: Translate): string {
  return t(`caption.kind.${target.kind.toLowerCase()}` as Parameters<Translate>[0]);
}

function titleKey(action: CaptionInsertionAction):
"caption.modal.title.insert" | "caption.modal.title.normalize" | "caption.modal.title.relocate" {
  if (action === "insert") return "caption.modal.title.insert";
  return action === "relocate" ? "caption.modal.title.relocate" : "caption.modal.title.normalize";
}

export class CaptionInsertionModal extends Modal {
  private applying = false;
  private closed = false;
  private readonly abort = (): void => { this.applying = false; this.close(); };

  constructor(private readonly options: CaptionInsertionModalOptions) {
    super(options.app);
  }

  override onOpen(): void {
    if (this.options.signal?.aborted) { this.close(); return; }
    this.options.signal?.addEventListener("abort", this.abort, { once: true });
    const { contentEl, titleEl } = this;
    const { target, translate: t } = this.options;
    titleEl.setText(t(titleKey(target.action), { kind: kindLabel(target, t) }));
    contentEl.createEl("p", {
      text: t(`caption.modal.description.${target.kind.toLowerCase()}` as Parameters<Translate>[0]),
    });

    let value = target.suggestedTitle;
    let confirmButton: ButtonComponent | null = null;
    const preview = contentEl.createEl("p", { cls: "number-suite-caption-preview" });
    preview.createEl("strong", { text: `${t("caption.modal.preview")}: ` });
    const previewCode = preview.createEl("code");

    const update = (): void => {
      const caption = formatCaptionInsertionSource(target, value);
      previewCode.setText(caption ?? "");
      confirmButton?.setDisabled(caption === null);
    };

    new Setting(contentEl)
      .setName(t("caption.modal.field"))
      .addText((text) => {
        text.setPlaceholder(t("caption.modal.placeholder"))
          .setValue(value)
          .onChange((next) => {
            value = next;
            update();
          });
        text.inputEl.focus();
        text.inputEl.select();
      });

    const actions = new Setting(contentEl);
    actions.addButton((button) => button
      .setButtonText(t("preview.cancel"))
      .onClick(() => this.close()));
    actions.addButton((button) => {
      confirmButton = button;
      button
        .setButtonText(t(target.action === "insert"
          ? "caption.modal.confirm.insert"
          : target.action === "relocate"
            ? "caption.modal.confirm.relocate"
            : "caption.modal.confirm.normalize"))
        .setCta()
        .onClick(() => {
          if (this.closed || this.options.signal?.aborted || this.applying || formatCaptionInsertionSource(target, value) === null) return;
          this.applying = true;
          button.setDisabled(true);
          void this.options.onConfirm(value.trim())
            .then((applied) => {
              if (this.closed || this.options.signal?.aborted) return;
              this.close();
              if (applied === true) this.options.onApplied?.();
            })
            .catch((error: unknown) => {
              this.applying = false;
              if (this.closed) return;
              button.setDisabled(false);
              console.error("Number Suite caption insertion failed", error);
            });
        });
    });
    update();
    applyModalDirection(this.modalEl, t);
  }

  override onClose(): void {
    this.closed = true;
    this.options.signal?.removeEventListener("abort", this.abort);
    this.contentEl.empty();
  }
}
