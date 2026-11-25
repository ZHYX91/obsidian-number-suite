import { Component, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { cleanupNumberSuiteReadingDom, HeadingReadingProcessor } from "../../src/reading/heading-postprocessor";
import { applySemanticTooltip, SemanticTooltipController } from "../../src/ui/semantic-tooltip";
import { installDomFixture, installDomFixtureIn } from "../../tests/ui/dom-fixture";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

window.verifyReadingLayout = async () => {
  installDomFixture();
  document.win = window;
  window.createFragment = () => document.createDocumentFragment();
  DocumentFragment.prototype.createSpan = HTMLElement.prototype.createSpan;
  const source = "Figure: Test\n\n| Before |\n| --- |\n| After |";
  const file = new TFile("layout.md");
  const popout = window.open("about:blank");
  assert(popout != null, "Could not open a second browser window");
  installDomFixtureIn(popout.HTMLElement);
  const popoutBody = popout.document.body;
  const app = {
    vault: { getAbstractFileByPath: () => file, cachedRead: async () => source },
    workspace: { on: () => ({}), iterateAllLeaves: (visit) => visit({ view: { containerEl: popoutBody } }) },
  };
  const processor = new HeadingReadingProcessor(app, () => DEFAULT_SETTINGS);
  const context = { sourcePath: file.path, frontmatter: null,
    getSectionInfo: () => ({ text: source, lineStart: 0, lineEnd: 4 }) };
  const root = document.body.createDiv({ cls: "markdown-rendered" });
  const caption = root.createEl("p", { text: "Figure: Test" });
  const table = root.createEl("table");
  table.createEl("tr").createEl("td", { text: "After" });
  root.style.cssText = "max-width: 360px; padding-inline: 12px 20px";
  table.style.cssText = "width: 140px; margin-inline-start: 16px";
  for (const direction of ["ltr", "rtl"]) {
    root.dir = direction;
    await processor.process(root, context);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(caption.classList.contains("number-suite-caption-object-aligned"), "Caption layout did not run");
    const center = (element) => { const r = element.getBoundingClientRect(); return r.left + r.width / 2; };
    assert(Math.abs(center(caption) - center(table)) <= 1, `Caption center in ${direction}`);
    cleanupNumberSuiteReadingDom(root);
  }

  const image = root.createEl("img");
  applySemanticTooltip(image, "Figure", "Long image description. ".repeat(400));
  const popoutImage = popoutBody.createEl("img");
  applySemanticTooltip(popoutImage, "Figure 2", "Already-open popout");
  const component = new Component();
  const controller = new SemanticTooltipController(app);
  controller.register(component);
  try {
    image.focus();
    const popup = document.querySelector('[role="tooltip"]');
    assert(popup != null, "Missing focused tooltip");
    const bounds = popup.getBoundingClientRect();
    assert(bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.left >= 0 && bounds.right <= innerWidth,
      "Tooltip outside viewport");
    assert(popup.scrollHeight > popup.clientHeight, "Long tooltip must scroll");
    image.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
    assert(popup.scrollTop + popup.clientHeight >= popup.scrollHeight - 1, "Last line must be reachable");
    popup.dispatchEvent(new Event("scroll"));
    assert(popup.isConnected, "Scrolling dismissed tooltip");
    image.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert(!popup.isConnected && document.activeElement === image, "Escape must retain focus on the object");
    popoutImage.focus();
    const secondTooltip = popoutBody.querySelector('[role="tooltip"]');
    assert(secondTooltip?.textContent.includes("Already-open popout"), "Pre-existing popout did not show its tooltip");
    component.unload();
    assert(!secondTooltip.isConnected, "Plugin unload retained the popout tooltip");
  } finally {
    component.unload();
    popout.close();
  }
};
