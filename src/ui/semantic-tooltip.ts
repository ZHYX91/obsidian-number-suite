import type { App, Component } from "obsidian";

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
  return true;
}

export function clearSemanticTooltip(element: HTMLElement): void {
  delete element.dataset.numberSuiteTooltip;
  delete element.dataset.numberSuiteTooltipTitle;
  delete element.dataset.numberSuiteTooltipBody;
}

function eventElement(event: Event): Element | null {
  const target = event.target;
  return target != null && "nodeType" in target && target.nodeType === 1
    ? target as Element
    : null;
}

export class SemanticTooltipController {
  private readonly registeredDocuments = new WeakSet<Document>();
  private active: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;

  constructor(private readonly app: App) {}

  register(component: Component): void {
    this.registerDocument(component, document);
    component.registerEvent(this.app.workspace.on("window-open", (_workspaceWindow, window) => {
      this.registerDocument(component, window.document);
    }));
    component.register(() => this.hide());
  }

  private registerDocument(component: Component, ownerDocument: Document): void {
    if (this.registeredDocuments.has(ownerDocument)) return;
    this.registeredDocuments.add(ownerDocument);
    component.registerDomEvent(ownerDocument, "pointerover", (event) => this.showFromEvent(event));
    component.registerDomEvent(ownerDocument, "focusin", (event) => this.showFromEvent(event));
    component.registerDomEvent(ownerDocument, "pointerout", (event) => this.hideFromEvent(event));
    component.registerDomEvent(ownerDocument, "focusout", (event) => this.hideFromEvent(event));
    component.registerDomEvent(ownerDocument, "contextmenu", () => this.hide());
    component.registerDomEvent(ownerDocument, "keydown", () => this.hide());
    component.registerDomEvent(ownerDocument, "scroll", () => this.hide(), { capture: true });
  }

  private showFromEvent(event: Event): void {
    const target = eventElement(event)?.closest<HTMLElement>(TOOLTIP_TARGET_SELECTOR) ?? null;
    if (target == null) return;
    if (this.active === target && this.tooltip?.isConnected === true) return;
    this.show(target);
  }

  private hideFromEvent(event: Event): void {
    if (this.active == null) return;
    const related = "relatedTarget" in event ? event.relatedTarget : null;
    if (
      related != null
      && typeof related === "object"
      && "nodeType" in related
      && this.active.contains(related as Node)
    ) return;
    this.hide();
  }

  private show(target: HTMLElement): void {
    this.hide();
    const title = target.dataset.numberSuiteTooltipTitle?.trim() ?? "";
    const body = target.dataset.numberSuiteTooltipBody?.trim() ?? "";
    if (title.length === 0 && body.length === 0) return;
    const ownerDocument = target.ownerDocument;
    const tooltip = ownerDocument.body.createDiv({ cls: "number-suite-semantic-tooltip" });
    tooltip.setAttribute("role", "tooltip");
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
    this.tooltip?.remove();
    this.tooltip = null;
    this.active = null;
  }
}
