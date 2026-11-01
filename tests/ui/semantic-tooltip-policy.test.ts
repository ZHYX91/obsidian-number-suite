// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Component, type App } from "obsidian";

import { parseNoteOverrides } from "../../src/config/frontmatter";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { installDomFixture } from "./dom-fixture";
import {
  SemanticTooltipController,
  semanticTooltipAllowed,
} from "../../src/ui/semantic-tooltip";

function allowed(controller: SemanticTooltipController, target: HTMLElement): boolean {
  const check = Reflect.get(controller, "allowed") as (element: HTMLElement) => boolean;
  return check.call(controller, target);
}

beforeEach(installDomFixture);

describe("semantic tooltip policy", () => {
  it.each([
    ["live-preview", "enableLivePreview"], ["source", "enableSourceMode"], ["reading", "enableReadingView"],
  ] as const)("honors the %s surface toggle", (mode, toggle) => {
    expect(semanticTooltipAllowed({ ...DEFAULT_SETTINGS, [toggle]: false }, undefined, mode)).toBe(false);
    expect(semanticTooltipAllowed({ ...DEFAULT_SETTINGS, [toggle]: true }, undefined, mode)).toBe(true);
  });

  it("closes a displayed tooltip on refresh so stale content cannot remain visible", () => {
    const controller = new SemanticTooltipController({} as App, () => DEFAULT_SETTINGS);
    const tooltip = document.body.appendChild(document.createElement("div"));
    Object.assign(controller, { tooltip, active: document.createElement("img") });
    controller.refresh();
    expect(tooltip.isConnected).toBe(false);
  });
  it("adds and removes only its own aria-describedby token", () => {
    const controller = new SemanticTooltipController({} as App, () => DEFAULT_SETTINGS);
    const target = document.body.appendChild(document.createElement("img"));
    target.dataset.numberSuiteTooltipTitle = "Figure 1";
    target.dataset.numberSuiteTooltipBody = "Diagram";
    target.setAttribute("aria-describedby", "existing-description");
    const show = Reflect.get(controller, "show") as (element: HTMLElement) => void;
    const hide = Reflect.get(controller, "hide") as () => void;

    show.call(controller, target);
    const describedBy = target.getAttribute("aria-describedby")?.split(/\s+/u) ?? [];
    expect(describedBy).toContain("existing-description");
    expect(describedBy.some((value) => value.startsWith("number-suite-semantic-tooltip-"))).toBe(true);

    hide.call(controller);
    expect(target.getAttribute("aria-describedby")).toBe("existing-description");
    target.remove();
  });

  it("honors the global tooltip toggle even when stale metadata remains on an image", () => {
    const app = { workspace: { iterateAllLeaves: () => undefined } } as unknown as App;
    const controller = new SemanticTooltipController(app, () => ({
      ...DEFAULT_SETTINGS,
      showImageCaptionTooltips: false,
    }));
    const image = document.createElement("img");
    image.dataset.numberSuiteTooltip = "true";
    expect(allowed(controller, image)).toBe(false);
  });

  it("blocks tooltips when the note disables Number Suite", () => {
    const overrides = parseNoteOverrides({
      "number-suite": ["disabled=true"],
    });
    expect(semanticTooltipAllowed(DEFAULT_SETTINGS, overrides)).toBe(false);
  });

  it("fails closed when a Live Preview target cannot be bound to an editor leaf", () => {
    const root = document.createElement("div");
    root.className = "markdown-source-view";
    const image = root.appendChild(document.createElement("img"));
    const app = { workspace: { iterateAllLeaves: () => undefined } } as unknown as App;
    const controller = new SemanticTooltipController(app, () => DEFAULT_SETTINGS);
    expect(allowed(controller, image)).toBe(false);
  });
});


describe("semantic tooltip document lifetime", () => {
  it("releases each closed popout while retaining the main document and permitting reopen", () => {
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const app = { workspace: { on: (name: string, callback: (...args: unknown[]) => void) => {
      handlers.set(name, callback); return {};
    } } } as unknown as App;
    const component = new Component(); component.load();
    const controller = new SemanticTooltipController(app);
    const popout = document.implementation.createHTMLDocument("popout");
    const added = vi.spyOn(popout, "addEventListener");
    const removed = vi.spyOn(popout, "removeEventListener");
    const mainRemoved = vi.spyOn(document, "removeEventListener");
    const listenerTypes = ["pointerover", "focusin", "pointerout", "focusout", "contextmenu", "keydown", "scroll"];
    controller.register(component);
    try {
      for (let cycle = 1; cycle <= 3; cycle += 1) {
        handlers.get("window-open")!(null, { document: popout });
        handlers.get("window-open")!(null, { document: popout });
        expect(added.mock.calls.filter(([type]) => listenerTypes.includes(type))).toHaveLength(cycle * 7);
        const active = popout.body.appendChild(popout.createElement("img"));
        const tooltip = popout.body.appendChild(popout.createElement("div"));
        Object.assign(controller, { active, tooltip });
        handlers.get("window-close")!(null, { document: popout });
        expect(removed.mock.calls.filter(([type]) => listenerTypes.includes(type))).toHaveLength(cycle * 7);
        expect(tooltip.isConnected).toBe(false);
        expect(mainRemoved.mock.calls.filter(([type]) => listenerTypes.includes(type))).toHaveLength(0);
        handlers.get("window-close")!(null, { document: popout });
      }
    } finally { component.unload(); }
    expect(removed.mock.calls.filter(([type]) => listenerTypes.includes(type))).toHaveLength(21);
    expect(mainRemoved.mock.calls.filter(([type]) => listenerTypes.includes(type))).toHaveLength(7);
    added.mockRestore(); removed.mockRestore(); mainRemoved.mockRestore();
  });
});
