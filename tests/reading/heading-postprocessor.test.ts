// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TFile, type App, type MarkdownPostProcessorContext } from "obsidian";

import { DEFAULT_SETTINGS, type NumberSuiteSettings } from "../../src/config/settings";
import {
  cleanupNumberSuiteReadingDom,
  HeadingReadingProcessor,
} from "../../src/reading/heading-postprocessor";

function settings(overrides: Partial<NumberSuiteSettings>): NumberSuiteSettings {
  return {
    ...DEFAULT_SETTINGS,
    customSchemes: DEFAULT_SETTINGS.customSchemes.map((scheme) => ({
      ...scheme,
      templates: [...scheme.templates],
    })),
    excludedFolders: [],
    ...overrides,
  };
}

beforeEach(() => {
  window.Node.prototype.createSpan = function createSpan(
    options?: string | DomElementInfo,
  ): HTMLSpanElement {
    const span = document.createElement("span");
    if (typeof options === "string") span.className = options;
    else if (options?.cls != null) {
      span.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
    }
    if (typeof options !== "string" && options?.text != null) {
      if (typeof options.text === "string") span.textContent = options.text;
      else span.append(options.text);
    }
    this.appendChild(span);
    return span;
  };
  Object.defineProperty(document, "win", { configurable: true, value: window });
  Object.assign(window, { createFragment: () => document.createDocumentFragment() });
});

function harness(source: string, configured: NumberSuiteSettings) {
  let currentSource = source;
  const FileConstructor = TFile as unknown as new (path: string) => TFile;
  const file = new FileConstructor("note.md");
  const cachedRead = vi.fn(async () => currentSource);
  const app = {
    vault: {
      getAbstractFileByPath: () => file,
      cachedRead,
    },
  } as unknown as App;
  const processor = new HeadingReadingProcessor(app, () => configured);
  const context = {
    sourcePath: "note.md",
    frontmatter: null,
    getSectionInfo: () => ({
      text: currentSource,
      lineStart: 0,
      lineEnd: currentSource.split("\n").length - 1,
    }),
  } as unknown as MarkdownPostProcessorContext;
  const container = document.createElement("div");
  document.body.appendChild(container);
  return {
    processor,
    context,
    container,
    cachedRead,
    setSource: (next: string) => { currentSource = next; },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("HeadingReadingProcessor", () => {
  it("adds virtual numbers using the full document counter plan", async () => {
    const { processor, context, container } = harness(
      "# First\n## Second",
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" }),
    );
    container.append(document.createElement("h1"), document.createElement("h2"));
    container.children[0]!.textContent = "First";
    container.children[1]!.textContent = "Second";

    await processor.process(container, context);

    expect(container.querySelectorAll(".number-suite-virtual")).toHaveLength(2);
    expect(container.children[0]?.textContent).toBe("1 First");
    expect(container.children[1]?.textContent).toBe("1.1 Second");
  });

  it("renders H7-H9 extension paragraphs as numbered headings and restores their markers", async () => {
    const source = "####### Seven\n\n######## Eight\n\n######### Nine";
    const { processor, context, container } = harness(
      source,
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" }),
    );
    for (const text of ["####### Seven", "######## Eight", "######### Nine"]) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      container.append(paragraph);
    }

    await processor.process(container, context);

    expect([...container.children].map((element) => element.classList.contains(
      "number-suite-extended-heading",
    ))).toEqual([true, true, true]);
    expect([...container.querySelectorAll(".number-suite-virtual")].map((item) => item.textContent))
      .toEqual([
        "1.1.1.1.1.1.1 ",
        "1.1.1.1.1.1.1.1 ",
        "1.1.1.1.1.1.1.1.1 ",
      ]);

    cleanupNumberSuiteReadingDom(container);
    expect([...container.children].map((element) => element.textContent)).toEqual([
      "####### Seven",
      "######## Eight",
      "######### Nine",
    ]);
  });

  it("numbers headings with closed inline comments using their visible titles", async () => {
    const { processor, context, container } = harness(
      "# <!-- lead --> Title\n# Ti<!-- middle -->tle\n# Tail <!-- tail -->",
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" }),
    );
    for (const title of ["Title", "Title", "Tail"]) {
      const heading = document.createElement("h1");
      heading.textContent = title;
      container.append(heading);
    }

    await processor.process(container, context);

    expect([...container.children].map((heading) => heading.textContent))
      .toEqual(["1 Title", "2 Title", "3 Tail"]);
  });

  it("fails closed for unsafe bare alphabetic custom schemes", async () => {
    const { processor, context, container } = harness(
      "# Plan",
      settings({
        showVirtualNumbers: true,
        selectedSchemeId: "custom-unsafe",
        customSchemes: [{
          id: "custom-unsafe",
          name: "Unsafe",
          revision: 1,
          baseLevel: 1,
          templates: ["{1.letter_lower}", "", "", "", "", ""],
          exclusions: [],
        }],
      }),
    );
    const heading = document.createElement("h1");
    heading.textContent = "Plan";
    container.append(heading);

    await processor.process(container, context);

    expect(heading.querySelector(".number-suite-virtual")).toBeNull();
    expect(heading.textContent).toBe("Plan");
  });

  it("lets only the latest overlapping render mutate a reading section", async () => {
    const source = "# First";
    const pendingReads: Array<(value: string) => void> = [];
    const FileConstructor = TFile as unknown as new (path: string) => TFile;
    const file = new FileConstructor("note.md");
    const app = {
      vault: {
        getAbstractFileByPath: () => file,
        cachedRead: () => new Promise<string>((resolve) => pendingReads.push(resolve)),
      },
    } as unknown as App;
    const processor = new HeadingReadingProcessor(
      app,
      () => settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" }),
    );
    const context = {
      sourcePath: "note.md",
      frontmatter: null,
      getSectionInfo: () => ({ text: source, lineStart: 0, lineEnd: 0 }),
    } as unknown as MarkdownPostProcessorContext;
    const container = document.createElement("div");
    const heading = document.createElement("h1");
    heading.textContent = "First";
    container.append(heading);
    document.body.append(container);

    const older = processor.process(container, context);
    const latest = processor.process(container, context);
    expect(pendingReads).toHaveLength(2);

    pendingReads[0]?.(source);
    await older;
    pendingReads[1]?.(source);
    await latest;

    expect(container.querySelectorAll(".number-suite-virtual")).toHaveLength(1);
    expect(heading.textContent).toBe("1 First");
  });

  it("conceals only the validated source prefix", async () => {
    const { processor, context, container } = harness(
      "# 1.1 Stored",
      settings({
        concealStoredNumbers: true,
        selectedSchemeId: "hierarchical",
        cleanupScope: "common",
      }),
    );
    const heading = document.createElement("h1");
    heading.textContent = "1.1 Stored";
    container.appendChild(heading);

    await processor.process(container, context);

    const concealed = heading.querySelector(".number-suite-concealed");
    expect(concealed?.textContent).toBe("1.1 ");
    expect(heading.textContent).toBe("1.1 Stored");
    expect(heading.getAttribute("data-number-suite-mode")).toBe("conceal");
  });

  it("fails closed when rendered heading levels do not match source", async () => {
    const { processor, context, container } = harness(
      "# First",
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" }),
    );
    const wrongLevel = document.createElement("h2");
    wrongLevel.textContent = "First";
    container.appendChild(wrongLevel);

    await processor.process(container, context);

    expect(container.querySelector(".number-suite-virtual")).toBeNull();
  });

  it("reapplies one full-document plan idempotently", async () => {
    const { processor, context, container, cachedRead } = harness(
      "# First\n## Second",
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" }),
    );
    container.append(document.createElement("h1"), document.createElement("h2"));
    container.children[0]!.textContent = "First";
    container.children[1]!.textContent = "Second";
    await processor.process(container, context);
    await processor.process(container, context);
    expect(cachedRead).toHaveBeenCalledTimes(2);
    expect(container.querySelectorAll(".number-suite-virtual")).toHaveLength(2);
  });

  it("cleans prior decorations when display is disabled", async () => {
    const configured = settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" });
    const { processor, context, container } = harness("# First", configured);
    const heading = document.createElement("h1");
    heading.textContent = "First";
    container.appendChild(heading);
    await processor.process(container, context);
    expect(heading.querySelector(".number-suite-virtual")).not.toBeNull();

    configured.showVirtualNumbers = false;
    await processor.process(container, context);

    expect(heading.querySelector(".number-suite-virtual")).toBeNull();
    expect(heading.textContent).toBe("First");
  });

  it("invalidates its plan after an exact same-length source edit", async () => {
    const { processor, context, container, setSource } = harness(
      "## One",
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical-h2" }),
    );
    const h2 = document.createElement("h2");
    h2.textContent = "One";
    container.appendChild(h2);
    await processor.process(container, context);
    expect(h2.textContent).toBe("1 One");

    setSource("### XX");
    const h3 = document.createElement("h3");
    h3.textContent = "XX";
    container.replaceChildren(h3);
    await processor.process(container, context);

    expect(h3.textContent).toBe("1.1 XX");
  });

  it("conceals stored text and prepends its virtual replacement in the same heading", async () => {
    const { processor, context, container } = harness(
      "# 1 Stored",
      settings({
        showVirtualNumbers: true,
        concealStoredNumbers: true,
        selectedSchemeId: "hierarchical",
      }),
    );
    const heading = document.createElement("h1");
    heading.textContent = "1 Stored";
    container.appendChild(heading);

    await processor.process(container, context);

    expect(heading.querySelector(".number-suite-concealed")?.textContent).toBe("1 ");
    expect(heading.querySelector(".number-suite-virtual")?.textContent).toBe("1 ");
    expect(heading.getAttribute("data-number-suite-mode")).toBe("show-conceal");
  });

  it("uses the selected custom scheme exclusions in Reading View", async () => {
    const configured = settings({
      showVirtualNumbers: true,
      selectedSchemeId: "custom-exclusions",
      customSchemes: [{
        id: "custom-exclusions",
        name: "Exclusions",
        revision: 1,
        baseLevel: 1,
        templates: [
          "{1.arabic}",
          "{1.arabic}.{2.arabic}",
          "{1.arabic}.{2.arabic}.{3.arabic}",
          "",
          "",
          "",
        ],
        exclusions: [{ title: "References", scope: "subtree" }],
      }],
    });
    const { processor, context, container } = harness(
      "# First\n## References\n### Book\n## Next",
      configured,
    );
    container.append(
      document.createElement("h1"),
      document.createElement("h2"),
      document.createElement("h3"),
      document.createElement("h2"),
    );
    ["First", "References", "Book", "Next"].forEach((title, index) => {
      container.children[index]!.textContent = title;
    });

    await processor.process(container, context);

    expect(Array.from(container.children).map((heading) => (
      heading.querySelector(".number-suite-virtual")?.textContent ?? null
    ))).toEqual(["1 ", null, null, "1.1 "]);
  });

  it("renders virtual caption numbers without changing caption text or requiring IDs", async () => {
    const { processor, context, container } = harness(
      "Figure: Plain\nFigure: Target ^fig",
      settings({ showCaptionNumbers: true }),
    );
    const first = document.createElement("p");
    first.textContent = "Figure: Plain";
    const second = document.createElement("p");
    second.textContent = "Figure: Target";
    container.append(first, second);

    await processor.process(container, context);

    expect(first.textContent).toBe("Figure 1: Plain");
    expect(second.textContent).toBe("Figure 2: Target");
    expect(container.querySelectorAll(".number-suite-caption-number")).toHaveLength(2);
  });

  it("centers caption types independently from virtual numbering", async () => {
    const source = [
      "Figure: Centered",
      "Table: Theme default",
      "Equation: Centered",
      "Code: Theme default",
    ].join("\n");
    const { processor, context, container } = harness(source, settings({
      showCaptionNumbers: false,
      showCrossReferences: false,
      showNoteNumbers: false,
    }));
    for (const text of source.split("\n")) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      container.append(paragraph);
    }

    await processor.process(container, context);

    expect([...container.children].map((item) => (
      item.classList.contains("number-suite-caption-centered")
    ))).toEqual([true, false, true, false]);
    expect([...container.children].map((item) => (
      (item as HTMLElement).dataset.numberSuiteCaptionKind ?? null
    ))).toEqual(["Figure", null, "Equation", null]);
    expect(container.querySelector(".number-suite-caption-number")).toBeNull();
  });

  it("enhances explicit same-file references while preserving the Obsidian link and alias", async () => {
    const { processor, context, container } = harness(
      "# Heading\nCross @[[Other#Heading]]\nSee @[[#Heading|chapter]]",
      settings({ showVirtualNumbers: true, showCrossReferences: true, selectedSchemeId: "hierarchical" }),
    );
    const heading = document.createElement("h1");
    heading.textContent = "Heading";
    const paragraph = document.createElement("p");
    paragraph.append("See @");
    const link = document.createElement("a");
    link.className = "internal-link";
    link.dataset.href = "#Heading";
    link.textContent = "chapter";
    paragraph.append(link);
    const crossFile = document.createElement("p");
    crossFile.append("Cross @");
    const crossFileLink = document.createElement("a");
    crossFileLink.className = "internal-link";
    crossFileLink.dataset.href = "Other#Heading";
    crossFileLink.textContent = "Heading";
    crossFile.append(crossFileLink);
    container.append(heading, crossFile, paragraph);

    await processor.process(container, context);

    expect(paragraph.textContent).toBe("See 1 chapter");
    expect(paragraph.querySelector("a")?.textContent).toBe("chapter");
    expect(crossFile.textContent).toBe("Cross @Heading");
    expect(paragraph.querySelector(".number-suite-reference-number")?.textContent).toBe("1 ");
    await processor.process(container, context);
    expect(paragraph.textContent).toBe("See 1 chapter");
  });

  it("fails closed for semantic references whose target has no visible valid number", async () => {
    const { processor, context, container } = harness(
      "# Heading\nSee @[[#Heading]]",
      settings({ showVirtualNumbers: false, showCrossReferences: true }),
    );
    const heading = document.createElement("h1");
    heading.textContent = "Heading";
    const paragraph = document.createElement("p");
    paragraph.append("See @");
    const link = document.createElement("a");
    link.className = "internal-link";
    link.dataset.href = "#Heading";
    link.textContent = "Heading";
    paragraph.append(link);
    container.append(heading, paragraph);

    await processor.process(container, context);

    expect(paragraph.textContent).toBe("See @Heading");
    expect(paragraph.querySelector(".number-suite-reference-number")).toBeNull();
  });

  it("renumbers native footnote and endnote references with independent counters", async () => {
    const source = [
      "Foot[^a] and end[^endnote:x].",
      "",
      "[^a]: Footnote",
      "[^endnote:x]: Endnote",
    ].join("\n");
    const { processor, context, container } = harness(source, settings({ showNoteNumbers: true }));
    const paragraph = document.createElement("p");
    paragraph.append("Foot");
    for (const nativeLabel of ["[1]", "[2]"]) {
      const sup = document.createElement("sup");
      sup.className = "footnote-ref";
      const link = document.createElement("a");
      link.textContent = nativeLabel;
      sup.append(link);
      paragraph.append(sup);
    }
    const section = document.createElement("section");
    section.className = "footnotes";
    const list = document.createElement("ol");
    for (const text of ["Footnote", "Endnote"]) {
      const item = document.createElement("li");
      item.className = "footnote-item";
      item.textContent = text;
      list.append(item);
    }
    section.append(list);
    container.append(paragraph, section);

    await processor.process(container, context);

    expect([...paragraph.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["[1]", "[E1]"]);
    expect([...paragraph.querySelectorAll("a")].map((link) => link.getAttribute("aria-label")))
      .toEqual(["Footnote 1", "Endnote E1"]);
    expect([...list.children].map((item) => item.getAttribute("value"))).toEqual(["1", "1"]);
    expect([...list.children].map((item) => (
      (item as HTMLElement).dataset.numberSuiteNoteLabel
    ))).toEqual(["1", "E1"]);
    expect([...list.children].map((item) => (item as HTMLElement).dataset.numberSuiteNoteKind))
      .toEqual(["footnote", "endnote"]);
    await processor.process(container, context);
    expect([...paragraph.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["[1]", "[E1]"]);
  });

  it("fully restores note ARIA, list values, captions, and headings during unload cleanup", async () => {
    const source = "# Heading\nFigure: Caption\nNote[^a].\n\n[^a]: A";
    const { processor, context, container } = harness(source, settings({
      showVirtualNumbers: true,
      showCaptionNumbers: true,
      showNoteNumbers: true,
    }));
    container.className = "markdown-reading-view";
    const heading = document.createElement("h1");
    heading.textContent = "Heading";
    const caption = document.createElement("p");
    caption.textContent = "Figure: Caption";
    const paragraph = document.createElement("p");
    paragraph.append("Note");
    const sup = document.createElement("sup");
    sup.className = "footnote-ref";
    const link = document.createElement("a");
    link.textContent = "[7]";
    link.setAttribute("aria-label", "Native note label");
    sup.append(link);
    paragraph.append(sup);
    const section = document.createElement("section");
    section.className = "footnotes";
    const list = document.createElement("ol");
    const item = document.createElement("li");
    item.className = "footnote-item";
    item.textContent = "A";
    item.setAttribute("value", "7");
    list.append(item);
    section.append(list);
    container.append(heading, caption, paragraph, section);

    await processor.process(container, context);
    expect(link.getAttribute("aria-label")).toBe("Footnote 1");
    expect(item.getAttribute("value")).toBe("1");
    expect(caption.classList.contains("number-suite-caption-centered")).toBe(true);

    cleanupNumberSuiteReadingDom(container);

    expect(link.textContent).toBe("[7]");
    expect(link.getAttribute("aria-label")).toBe("Native note label");
    expect(link.dataset.numberSuiteNoteAriaPresent).toBeUndefined();
    expect(link.dataset.numberSuiteNoteAriaOriginal).toBeUndefined();
    expect(item.getAttribute("value")).toBe("7");
    expect(item.dataset.numberSuiteNoteLabel).toBeUndefined();
    expect(caption.classList.contains("number-suite-caption-centered")).toBe(false);
    expect(caption.dataset.numberSuiteCaptionKind).toBeUndefined();
    expect(heading.getAttribute("data-number-suite-mode")).toBeNull();
    expect(heading.querySelector(".number-suite-virtual")).toBeNull();
  });

  it("keeps native note rendering unchanged when the rendered reference count differs", async () => {
    const source = "One[^a] two[^b].\n\n[^a]: A\n[^b]: B";
    const { processor, context, container } = harness(source, settings({ showNoteNumbers: true }));
    const sup = document.createElement("sup");
    sup.className = "footnote-ref";
    const link = document.createElement("a");
    link.textContent = "[1]";
    sup.append(link);
    container.append(sup);

    await processor.process(container, context);

    expect(link.textContent).toBe("[1]");
    expect(link.dataset.numberSuiteNoteOriginal).toBeUndefined();
  });
});
