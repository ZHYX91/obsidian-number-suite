// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createTranslator } from "../../src/config/i18n";
import { renderNoteOperationGuide } from "../../src/ui/note-operation-guide";
import { installDomFixture } from "./dom-fixture";

describe("current-note operation guide", () => {
  beforeEach(installDomFixture);
  it.each(["en", "zh", "ar"] as const)("distinguishes heading transforms from persisted per-note choices (%s)", (language) => {
    const host = document.createElement("div");
    const t = createTranslator(language);
    renderNoteOperationGuide(host, t);
    expect(host.querySelector("details")?.open).toBe(false);
    expect(host.textContent).toContain(t("panel.modes.properties"));
    expect(host.querySelectorAll("th[scope='col']")).toHaveLength(4);
    const rows = [...host.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 3).every(row => row.lastElementChild?.textContent === t("panel.modes.unchanged"))).toBe(true);
    expect(rows.slice(3).every(row => row.lastElementChild?.textContent === t("panel.modes.rewritten"))).toBe(true);
    expect(host.querySelector("button, input, select")).toBeNull();
  });
});
