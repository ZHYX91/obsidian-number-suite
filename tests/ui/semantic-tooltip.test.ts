// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  applySemanticTooltip,
  clearSemanticTooltip,
} from "../../src/ui/semantic-tooltip";

describe("semantic tooltip metadata", () => {
  it("keeps distinct title and body fields", () => {
    const element = document.createElement("img");
    expect(applySemanticTooltip(element, "Figure 1: Lunch", "tray of food")).toBe(true);
    expect(element.dataset).toMatchObject({
      numberSuiteTooltip: "true",
      numberSuiteTooltipTitle: "Figure 1: Lunch",
      numberSuiteTooltipBody: "tray of food",
    });
  });

  it("deduplicates equal text and removes empty tooltip metadata", () => {
    const element = document.createElement("span");
    expect(applySemanticTooltip(element, "Cat", " cat ")).toBe(true);
    expect(element.dataset.numberSuiteTooltipBody).toBe("");
    clearSemanticTooltip(element);
    expect(element.dataset.numberSuiteTooltip).toBeUndefined();
    expect(applySemanticTooltip(element, "", "")).toBe(false);
  });
});
