// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { collapseSettingsGuides } from "../../src/ui/settings/guide-disclosure";

beforeEach(() => document.body.replaceChildren());

function build(key = "number-suite-export-guide"): HTMLElement {
  const panel = document.createElement("section");
  panel.innerHTML = `<div class="number-suite-settings-guide ${key}">
      <div class="number-suite-settings-guide-heading"><strong>Example guide</strong></div>
      <div class="number-suite-settings-guide-body">
        <p>Essential note</p><pre>Long tutorial</pre><p>Safety warning</p>
      </div></div>`;
  document.body.appendChild(panel);
  return panel;
}
describe("settings tutorial disclosure", () => {
  it("is initially closed, keeps essential context visible and never persists settings", () => {
    const panel = build();
    const expanded = new Set<string>();
    const remember = collapseSettingsGuides(panel, expanded);
    const details = panel.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe("Example guide");
    expect(panel.querySelector(".number-suite-settings-guide-exterior")?.textContent).toBe("Essential note");
    expect(panel.querySelector("pre")?.textContent).toBe("Long tutorial");
    details.open = true;
    remember(); // A panel can be redrawn before a queued toggle event arrives.
    expect(expanded.size).toBe(1);
    // The same settings tab instance re-renders into a fresh panel.
    panel.remove();
    const again = build();
    collapseSettingsGuides(again, expanded);
    expect(again.querySelector("details")?.open).toBe(true);
    expanded.clear(); // NumberSuiteSettingTab.hide() clears only in-memory state.
    details.dispatchEvent(new Event("toggle"));
    expect(expanded.size).toBe(0);
  });
  it("keeps both batch warnings and exclusions outside the collapsed steps", () => {
    const panel = build("number-suite-batch-guide");
    const body = panel.querySelector(".number-suite-settings-guide-body")!;
    body.appendChild(document.createElement("p")).textContent = "Exclusions matter";
    collapseSettingsGuides(panel, new Set());
    expect(panel.querySelector("details")?.open).toBe(false);
    const visible = Array.from(panel.querySelectorAll(":scope > p")).map((p) => p.textContent);
    expect(visible).toEqual(["Essential note", "Safety warning", "Exclusions matter"]);
  });

  it("keeps operation warnings visible while tutorial instructions are closed", () => {
    const panel = build("number-suite-file-operations-guide");
    collapseSettingsGuides(panel, new Set());
    expect(panel.querySelector("details")?.open).toBe(false);
    const outside = Array.from(panel.querySelectorAll(":scope > p")).map(e => e.textContent);
    expect(outside).toEqual(["Essential note", "Safety warning"]);
  });
});
