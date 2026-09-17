// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import type { App } from "obsidian";

import { parseNoteOverrides } from "../../src/config/frontmatter";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import {
  SemanticTooltipController,
  semanticTooltipAllowed,
} from "../../src/ui/semantic-tooltip";

function allowed(controller: SemanticTooltipController, target: HTMLElement): boolean {
  const check = Reflect.get(controller, "allowed") as (element: HTMLElement) => boolean;
  return check.call(controller, target);
}

describe("semantic tooltip policy", () => {
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
