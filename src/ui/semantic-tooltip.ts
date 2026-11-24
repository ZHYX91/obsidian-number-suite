import { workspaceDocuments } from "../adapters/obsidian/workspace-documents";
import { Component, type App } from "obsidian";

import {
  parseNoteOverrides,
  resolveNoteSettings,
  type NoteOverrides,
} from "../config/frontmatter";
import { parseNoteOverridesFromSource } from "../config/frontmatter-source";
import type { NumberSuiteSettings } from "../config/settings";

const TOOLTIP_TARGET_SELECTOR = "[data-number-suite-tooltip='true']";

function normalized(value: string): string {
  return value.normalize("NFC").trim().replace(/[ \t]+/gu, " ").toLowerCase();
}

export function applySemanticTooltip(
  element: HTMLElement,
  title: string,
  body: string,
): boolean {
  const cleanTitle = title.trim();
  const cleanBody = normalized(cleanTitle) === normalized(body) ? "" : body.trim();
  clearSemanticTooltip(element);
  if (cleanTitle.length === 0 && cleanBody.length === 0) return false;
  element.dataset.numberSuiteTooltip = "true";
  element.dataset.numberSuiteTooltipTitle = cleanTitle;
  element.dataset.numberSuiteTooltipBody = cleanBody;
  if (!element.hasAttribute("tabindex")) {
    element.tabIndex = 0;
    element.dataset.numberSuiteTooltipOwnTabindex = "true";
  }
  return true;
}

export function clearSemanticTooltip(element: HTMLElement): void {
  delete element.dataset.numberSuiteTooltip;
  delete element.dataset.numberSuiteTooltipTitle;
  delete element.dataset.numberSuiteTooltipBody;
  if (element.dataset.numberSuiteTooltipOwnTabindex === "true") {
    element.removeAttribute("tabindex");
    delete element.dataset.numberSuiteTooltipOwnTabindex;
  }
}

/** Pure policy shared by DOM gating and tests. */
export function semanticTooltipAllowed(
  settings: NumberSuiteSettings,
  overrides: NoteOverrides = parseNoteOverrides(null),
  mode?: "live-preview" | "source" | "reading",
): boolean {
  if (!settings.showImageCaptionTooltips) return false;
  if (mode === "live-preview" && !settings.enableLivePreview) return false;
  if (mode === "source" && !settings.enableSourceMode) return false;
  if (mode === "reading" && !settings.enableReadingView) return false;
  const effective = resolveNoteSettings(settings, overrides);
  return effective.valid && !effective.disabled;
}

function eventElement(event: Event): Element | null {
  const target = event.target;
  return target != null && "nodeType" in target && target.nodeType === 1
    ? target as Element
    : null;
}

function sourceForTarget(app: App, target: HTMLElement): string | null {
  let source: string | null = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (source != null || !leaf.view.containerEl.contains(target)) return;
    const candidate = leaf.view as unknown as {
      readonly editor?: { getValue?: () => string };
    };
    if (typeof candidate.editor?.getValue === "function") {
      source = candidate.editor.getValue();
    }
  });
  return source;
}

export class SemanticTooltipController {
  private readonly registeredDocuments = new Map<Document, Component>();
  private active: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private describedBy: { readonly id: string; readonly target: HTMLElement } | null = null;
  private tooltipSequence = 0;
  private cancelPointerExit: (() => void) | null = null;

  constructor(
    private readonly app: App,
    private readonly getSettings?: () => NumberSuiteSettings,
  ) {}

  register(component: Component): void {
    for (const ownerDocument of workspaceDocuments(this.app.workspace)) {
      this.registerDocument(component, ownerDocument);
    }
    component.registerEvent(this.app.workspace.on("window-open", (_workspaceWindow, window) => {
      this.registerDocument(component, window.document);
    }));
    component.registerEvent(this.app.workspace.on("window-close", (_workspaceWindow, window) => {
      const owner = this.registeredDocuments.get(window.document);
      if (owner != null) component.removeChild(owner);
    }));
    component.register(() => this.hide());
  }

  /** Re-evaluate an already-open tooltip after settings or per-note overrides change. */
  refresh(): void {
    this.hide();
  }

  private registerDocument(component: Component, ownerDocument: Document): void {
    if (this.registeredDocuments.has(ownerDocument)) return;
    const owner = component.addChild(new Component());
    this.registeredDocuments.set(ownerDocument, owner);
    owner.register(() => {
      this.registeredDocuments.delete(ownerDocument);
      if (this.active?.ownerDocument === ownerDocument) this.hide();
    });
    owner.registerDomEvent(ownerDocument, "pointerover", (event) => this.showFromEvent(event));
    owner.registerDomEvent(ownerDocument, "focusin", (event) => this.showFromEvent(event));
    owner.registerDomEvent(ownerDocument, "pointerout", (event) => this.hideFromEvent(event));
    owner.registerDomEvent(ownerDocument, "focusout", (event) => this.hideFromEvent(event));
    owner.registerDomEvent(ownerDocument, "contextmenu", () => this.hide());
    owner.registerDomEvent(ownerDocument, "keydown", (event) => this.handleKey(event));
    owner.registerDomEvent(ownerDocument, "scroll", (event) => {
      if (this.active?.ownerDocument === ownerDocument && !this.tooltip?.contains(eventElement(event))) this.hide();
    }, { capture: true });
    if (ownerDocument.defaultView != null) {
      owner.registerDomEvent(ownerDocument.defaultView, "resize", () => {
        if (this.active?.ownerDocument === ownerDocument) this.hide();
      });
    }
  }

  private showFromEvent(event: Event): void {
    const element = eventElement(event);
    if (this.tooltip?.contains(element)) {
      this.cancelPointerExit?.();
      return;
    }
    const target = element?.closest<HTMLElement>(TOOLTIP_TARGET_SELECTOR) ?? null;
    if (target == null || !this.allowed(target)) return;
    this.cancelPointerExit?.();
    if (this.active === target && this.tooltip?.isConnected === true) return;
    this.show(target);
  }

  private hideFromEvent(event: Event): void {
    const element = eventElement(event);
    if (!this.active?.contains(element) && !this.tooltip?.contains(element)) return;
    const related = "relatedTarget" in event ? event.relatedTarget : null;
    if (related != null && typeof related === "object" && "nodeType" in related
      && (this.active?.contains(related as Node) || this.tooltip?.contains(related as Node))) return;
    const view = this.active?.ownerDocument.defaultView;
    if (event.type === "pointerout" && view != null) {
      if (this.active === view.document.activeElement) return;
      this.cancelPointerExit?.();
      // Give the pointer time to cross the gap between the object and its tooltip.
      const timer = view.setTimeout(() => this.hide(), 180);
      this.cancelPointerExit = () => {
        view.clearTimeout(timer);
        this.cancelPointerExit = null;
      };
    } else this.hide();
  }

  private handleKey(event: KeyboardEvent): void {
    const tooltip = this.tooltip;
    if (tooltip == null || this.active?.ownerDocument !== event.currentTarget) return;
    if (event.key === "Escape") {
      this.hide();
      return;
    }
    if (event.target !== this.active || tooltip.scrollHeight <= tooltip.clientHeight
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    switch (event.key) {
      case "ArrowDown": tooltip.scrollTop += 32; break;
      case "ArrowUp": tooltip.scrollTop -= 32; break;
      case "PageDown": tooltip.scrollTop += tooltip.clientHeight; break;
      case "PageUp": tooltip.scrollTop -= tooltip.clientHeight; break;
      case "Home": tooltip.scrollTop = 0; break;
      case "End": tooltip.scrollTop = tooltip.scrollHeight; break;
      default: return;
    }
    event.preventDefault();
  }

  private allowed(target: HTMLElement): boolean {
    const settings = this.getSettings?.();
    if (settings == null) return true;
    const sourceRoot = target.closest(".markdown-source-view");
    if (sourceRoot == null) {
      return semanticTooltipAllowed(settings, undefined, "reading");
    }
    const source = sourceForTarget(this.app, target);
    if (source == null) return false;
    const overrides = parseNoteOverridesFromSource(source);
    const mode = sourceRoot.classList.contains("is-live-preview") ? "live-preview" : "source";
    return overrides != null && semanticTooltipAllowed(settings, overrides, mode);
  }

  private show(target: HTMLElement): void {
    this.hide();
    const title = target.dataset.numberSuiteTooltipTitle?.trim() ?? "";
    const body = target.dataset.numberSuiteTooltipBody?.trim() ?? "";
    if (title.length === 0 && body.length === 0) return;
    const ownerDocument = target.ownerDocument;
    const tooltip = ownerDocument.body.createDiv({ cls: "number-suite-semantic-tooltip" });
    tooltip.setAttribute("role", "tooltip");
    const tooltipId = `number-suite-semantic-tooltip-${++this.tooltipSequence}`;
    tooltip.id = tooltipId;
    const describedBy = target.getAttribute("aria-describedby")?.trim() ?? "";
    target.setAttribute("aria-describedby", describedBy.length === 0 ? tooltipId : `${describedBy} ${tooltipId}`);
    this.describedBy = { id: tooltipId, target };
    if (title.length > 0) {
      const heading = tooltip.createDiv({ cls: "number-suite-semantic-tooltip-title" });
      heading.textContent = title;
    }
    if (body.length > 0) {
      const content = tooltip.createDiv({ cls: "number-suite-semantic-tooltip-body" });
      content.textContent = body;
    }
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const view = ownerDocument.defaultView;
    const width = view?.innerWidth ?? ownerDocument.documentElement.clientWidth;
    const height = view?.innerHeight ?? ownerDocument.documentElement.clientHeight;
    const left = Math.max(8, Math.min(targetRect.left, width - tooltipRect.width - 8));
    const preferredTop = targetRect.bottom + 8;
    const top = preferredTop + tooltipRect.height <= height - 8
      ? preferredTop
      : Math.max(8, targetRect.top - tooltipRect.height - 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    this.active = target;
    this.tooltip = tooltip;
  }

  private hide(): void {
    this.cancelPointerExit?.();
    if (this.describedBy != null) {
      const { id, target } = this.describedBy;
      const remaining = (target.getAttribute("aria-describedby") ?? "")
        .split(/\s+/u)
        .filter((value) => value.length > 0 && value !== id);
      if (remaining.length === 0) target.removeAttribute("aria-describedby");
      else target.setAttribute("aria-describedby", remaining.join(" "));
      this.describedBy = null;
    }
    this.tooltip?.remove();
    this.tooltip = null;
    this.active = null;
  }
}
