// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownView, TFile, type App, type MarkdownPostProcessorContext } from "obsidian";

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

const READING_CAPTION_KINDS = ["Figure", "Table", "Equation", "Code"] as const;
const READING_CARRIER_CASES = [
  {
    objectKind: "Figure",
    objectSource: "![[carrier.png]]",
    createRoot: (): HTMLElement => {
      const paragraph = document.createElement("p");
      paragraph.append(document.createElement("img"));
      return paragraph;
    },
  },
  {
    objectKind: "Table",
    objectSource: "| A |\n| --- |\n| 1 |",
    createRoot: (): HTMLElement => document.createElement("table"),
  },
  {
    objectKind: "Equation",
    objectSource: "$$ x = 1 $$",
    createRoot: (): HTMLElement => {
      const equation = document.createElement("div");
      equation.className = "math-block";
      return equation;
    },
  },
  {
    objectKind: "Code",
    objectSource: "```ts\nconst x = 1;\n```",
    createRoot: (): HTMLElement => document.createElement("pre"),
  },
] as const;

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
  const MarkdownViewConstructor = MarkdownView as unknown as new () => MarkdownView;
  const view = new MarkdownViewConstructor();
  view.file = file;
  const setCursor = vi.fn();
  const scrollIntoView = vi.fn();
  const focus = vi.fn();
  Object.assign(view, {
    getMode: () => "source",
    editor: { setCursor, scrollIntoView, focus },
  });
  const setEphemeralState = vi.fn();
  const openFile = vi.fn(async () => undefined);
  const leaf = { view, setEphemeralState, openFile };
  const revealLeaf = vi.fn(async () => undefined);
  const app = {
    vault: {
      getAbstractFileByPath: () => file,
      cachedRead,
    },
    workspace: {
      iterateAllLeaves: (callback: (candidate: typeof leaf) => void) => callback(leaf),
      getLeaf: () => leaf,
      revealLeaf,
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
    navigation: { setCursor, scrollIntoView, focus, setEphemeralState, openFile, revealLeaf },
    setSource: (next: string) => { currentSource = next; },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("HeadingReadingProcessor", () => {
  it("keeps the native fold control before the numeral through refresh and cleanup", async () => {
    const { processor, context, container } = harness(
      "# **First**",
      settings({ showVirtualNumbers: true, selectedSchemeId: "hierarchical" }),
    );
    const heading = document.createElement("h1");
    const control = document.createElement("span");
    control.className = "heading-collapse-indicator collapse-indicator collapse-icon";
    const toggle = vi.fn();
    control.addEventListener("click", toggle);
    const title = document.createElement("strong");
    title.textContent = "First";
    heading.append(control, title);
    container.append(heading);

    for (let render = 0; render < 2; render += 1) {
      await processor.process(container, context);
      expect(heading.firstChild).toBe(control);
      expect(control.nextElementSibling?.classList.contains("number-suite-heading-number")).toBe(true);
      expect(heading.lastChild).toBe(title);
      expect(heading.querySelectorAll(".number-suite-heading-number")).toHaveLength(1);
    }
    control.click();
    expect(toggle).toHaveBeenCalledTimes(1);
    cleanupNumberSuiteReadingDom(container);
    expect([...heading.childNodes]).toEqual([control, title]);
    control.click();
    expect(toggle).toHaveBeenCalledTimes(2);
  });

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

  it("decorates a reading section that is virtualized while its source is loading", async () => {
    const source = "# First";
    let resolveRead: ((value: string) => void) | undefined;
    const FileConstructor = TFile as unknown as new (path: string) => TFile;
    const file = new FileConstructor("note.md");
    const app = {
      vault: {
        getAbstractFileByPath: () => file,
        cachedRead: () => new Promise<string>((resolve) => { resolveRead = resolve; }),
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

    const processing = processor.process(container, context);
    container.remove();
    resolveRead?.(source);
    await processing;

    expect(container.isConnected).toBe(false);
    expect(heading.textContent).toBe("1 First");

    document.body.append(container);
    expect(heading.textContent).toBe("1 First");
  });

  it("preserves full-document numbering and concealment across detached later sections", async () => {
    const source = "## 1 First\n\n### 1.1 Child\n\n## 2 Second\n\n### 2.1 Later";
    const { processor, context, container, cachedRead } = harness(source, settings({
      showVirtualNumbers: true,
      concealStoredNumbers: true,
      selectedSchemeId: "hierarchical-h2",
      concealScope: "templates",
    }));
    context.getSectionInfo = () => ({ text: source, lineStart: 4, lineEnd: 6 });
    const chapter = document.createElement("h2");
    chapter.textContent = "2 Second";
    const section = document.createElement("h3");
    section.textContent = "2.1 Later";
    container.append(chapter, section);
    let resolveRead: ((value: string) => void) | undefined;
    cachedRead.mockImplementationOnce(() => new Promise<string>((resolve) => { resolveRead = resolve; }));
    const processing = processor.process(container, context);
    container.remove();
    resolveRead?.(source);
    await processing;

    for (const [heading, prefix] of [[chapter, "2 "], [section, "2.1 "]] as const) {
      expect(heading.dataset.numberSuiteMode).toBe("show-conceal");
      expect(heading.querySelector(".number-suite-concealed")?.textContent).toBe(prefix);
      expect(heading.querySelectorAll(".number-suite-virtual")).toHaveLength(1);
      expect(heading.querySelector(".number-suite-virtual")?.textContent).toBe(prefix);
    }
    document.body.append(container);
    await processor.process(container, context);
    expect(container.querySelectorAll(".number-suite-virtual")).toHaveLength(2);
    container.remove();
    processor.dispose();
    processor.dispose();
    document.body.append(container);
    expect(chapter.textContent).toBe("2 Second");
    expect(section.textContent).toBe("2.1 Later");
    expect(container.querySelector(".number-suite-concealed")).toBeNull();
    expect(chapter.hasAttribute("data-number-suite-mode")).toBe(false);
    await processor.process(container, context);
    expect(container.querySelector(".number-suite-virtual")).toBeNull();
  });

  it.each(["invalidate", "dispose"] as const)("does not decorate detached sections after %s", async (end) => {
    const source = "# First";
    const { processor, context, container, cachedRead } = harness(source, settings({
      showVirtualNumbers: true,
      selectedSchemeId: "hierarchical",
    }));
    const heading = document.createElement("h1");
    heading.textContent = "First";
    container.append(heading);
    let resolveRead: ((value: string) => void) | undefined;
    cachedRead.mockImplementationOnce(() => new Promise<string>((resolve) => { resolveRead = resolve; }));
    const processing = processor.process(container, context);
    container.remove();
    processor[end]();
    resolveRead?.(source);
    await processing;
    document.body.append(container);
    expect(heading.textContent).toBe("First");
    expect(heading.querySelector(".number-suite-virtual")).toBeNull();
  });

  it("updates a later section after a one-character same-length source change", async () => {
    const source = "## A\n\n## B";
    const { processor, context, container, setSource } = harness(source, settings({
      showVirtualNumbers: true,
      selectedSchemeId: "hierarchical-h2",
    }));
    context.getSectionInfo = () => ({ text: source, lineStart: 2, lineEnd: 2 });
    const heading = document.createElement("h2");
    heading.textContent = "B";
    container.append(heading);
    await processor.process(container, context);
    expect(heading.textContent).toBe("2 B");
    setSource("#  A\n\n## B");
    await processor.process(container, context);
    expect(heading.textContent).toBe("1 B");
    processor.dispose();
  });

  it("cancels queued caption layout when disposing a detached section", async () => {
    const { processor, context, container } = harness("Figure: Caption\n\n![[image.png]]", settings({
      showCaptionNumbers: true,
    }));
    const callbacks: FrameRequestCallback[] = [];
    const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    try {
      const caption = document.createElement("p");
      caption.textContent = "Figure: Caption";
      const object = document.createElement("p");
      const image = document.createElement("img");
      object.append(image);
      container.append(caption, object);
      caption.getBoundingClientRect = () => ({ width: 20, left: 0 }) as DOMRect;
      image.getBoundingClientRect = () => ({ width: 100, left: 40 }) as DOMRect;
      await processor.process(container, context);
      expect(callbacks.length).toBeGreaterThan(0);
      container.remove();
      processor.dispose();
      document.body.append(container);
      for (const callback of callbacks) callback(0);
      expect(cancel).toHaveBeenCalled();
      expect(caption.classList.contains("number-suite-caption-object-aligned")).toBe(false);
      expect(caption.style.getPropertyValue("--number-suite-caption-inline-offset")).toBe("");
      expect(caption.textContent).toBe("Figure: Caption");
    } finally {
      processor.dispose();
      request.mockRestore();
      cancel.mockRestore();
    }
  });

  it("conceals only the validated source prefix", async () => {
    const { processor, context, container } = harness(
      "# 1 Stored",
      settings({
        concealStoredNumbers: true,
        selectedSchemeId: "hierarchical",
        concealScope: "templates",
      }),
    );
    const heading = document.createElement("h1");
    heading.textContent = "1 Stored";
    container.appendChild(heading);

    await processor.process(container, context);

    const concealed = heading.querySelector(".number-suite-concealed");
    expect(concealed?.textContent).toBe("1 ");
    expect(heading.textContent).toBe("1 Stored");
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
    expect(container.querySelectorAll(".number-suite-caption-pill")).toHaveLength(2);
  });

  it("moves a bound Figure caption below only in the rendered DOM and shares its tooltip", async () => {
    const source = "Figure: Lunch\n\n![[lunch.png|tray of food]]";
    const { processor, context, container } = harness(source, settings({
      figureCaptionPlacement: "below",
      showCaptionNumbers: true,
      showImageCaptionTooltips: true,
    }));
    const caption = document.createElement("p");
    caption.textContent = "Figure: Lunch";
    const imageParagraph = document.createElement("p");
    const image = document.createElement("img");
    image.alt = "tray of food";
    imageParagraph.append(image);
    container.append(caption, imageParagraph);

    await processor.process(container, context);

    expect([...container.children]).toEqual([imageParagraph, caption]);
    expect(caption.textContent).toBe("Figure 1: Lunch");
    expect(caption.dataset.numberSuiteCaptionPlacement).toBe("below");
    expect(caption.dataset.numberSuiteTooltipTitle).toBe("Figure 1: Lunch");
    expect(caption.dataset.numberSuiteTooltipBody).toBe("tray of food");
    expect(image.dataset.numberSuiteTooltipTitle).toBe("Figure 1: Lunch");
    expect(image.dataset.numberSuiteTooltipBody).toBe("tray of food");
    expect(imageParagraph.classList.contains("number-suite-caption-object")).toBe(true);
    expect(imageParagraph.dataset.numberSuiteCaptionPlacement).toBe("below");

    cleanupNumberSuiteReadingDom(container);
    expect([...container.children]).toEqual([caption, imageParagraph]);
    expect(caption.textContent).toBe("Figure: Lunch");
    expect(caption.dataset.numberSuiteTooltip).toBeUndefined();
    expect(image.dataset.numberSuiteTooltip).toBeUndefined();
    expect(imageParagraph.classList.contains("number-suite-caption-object")).toBe(false);
  });

  it("binds a Figure caption to a table carrier and restores its stable DOM origin", async () => {
    const source = [
      "Figure: Comparison",
      "",
      "| Before | After |",
      "| --- | --- |",
      "| ![[before.png]] | ![[after.png]] |",
    ].join("\n");
    const { processor, context, container } = harness(source, settings({
      figureCaptionPlacement: "below",
      showCaptionNumbers: true,
      showImageCaptionTooltips: true,
    }));
    const caption = document.createElement("p");
    caption.textContent = "Figure: Comparison";
    const table = document.createElement("table");
    container.getBoundingClientRect = () => ({
      left: 100, right: 900, top: 0, bottom: 600, width: 800, height: 600, x: 100, y: 0,
      toJSON: () => ({}),
    });
    table.getBoundingClientRect = () => ({
      left: 220, right: 620, top: 100, bottom: 300, width: 400, height: 200, x: 220, y: 100,
      toJSON: () => ({}),
    });
    caption.getBoundingClientRect = () => ({
      left: 0, right: 100, top: 0, bottom: 30, width: 100, height: 30, x: 0, y: 0,
      toJSON: () => ({}),
    });
    container.append(caption, table);

    await processor.process(container, context);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

    expect([...container.children]).toEqual([table, caption]);
    expect(caption.textContent).toBe("Figure 1: Comparison");
    expect(caption.classList.contains("number-suite-caption-centered")).toBe(true);
    expect(table.classList.contains("number-suite-caption-object")).toBe(true);
    expect(table.dataset.numberSuiteTooltipTitle).toBe("Figure 1: Comparison");
    expect(caption.style.getPropertyValue("--number-suite-caption-inline-offset")).toBe("270px");

    table.replaceWith(document.createElement("div"));
    cleanupNumberSuiteReadingDom(container);
    expect(container.firstElementChild).toBe(caption);
    expect(caption.textContent).toBe("Figure: Comparison");
    expect(caption.style.getPropertyValue("--number-suite-caption-inline-offset")).toBe("");
  });

  it("renders all sixteen caption and carrier combinations", async () => {
    for (const captionKind of READING_CAPTION_KINDS) {
      for (const carrier of READING_CARRIER_CASES) {
        const source = `${captionKind}: Pair\n\n${carrier.objectSource}`;
        const { processor, context, container } = harness(source, settings({
          showCaptionNumbers: true,
          centerFigureCaptions: true,
          centerTableCaptions: true,
          centerEquationCaptions: true,
          centerCodeCaptions: true,
          figureCaptionPlacement: "below",
          tableCaptionPlacement: "below",
          equationCaptionPlacement: "below",
          codeCaptionPlacement: "below",
        }));
        const caption = document.createElement("p");
        caption.textContent = `${captionKind}: Pair`;
        const objectRoot = carrier.createRoot();
        container.append(caption, objectRoot);

        await processor.process(container, context);

        const pair = `${captionKind} -> ${carrier.objectKind}`;
        expect([...container.children], pair).toEqual([objectRoot, caption]);
        expect(caption.textContent, pair).toBe(`${captionKind} 1: Pair`);
        expect(caption.dataset.numberSuiteCaptionPlacement, pair).toBe("below");
        expect(caption.classList.contains("number-suite-caption-centered"), pair).toBe(true);
        expect(objectRoot.classList.contains("number-suite-caption-object"), pair).toBe(true);

        cleanupNumberSuiteReadingDom(container);
        container.remove();
      }
    }
  });

  it("places and restores a code caption across separately owned Reading View sections", async () => {
    const source = "---\ntitle: Example\n---\n```js\nconst x = 1;\n```\nCode: Example";
    const { processor, container } = harness(source, settings({ showCaptionNumbers: true }));
    container.className = "markdown-preview-section";
    const objectSection = document.createElement("div");
    objectSection.className = "el-pre";
    const code = document.createElement("pre");
    objectSection.append(code);
    const captionSection = document.createElement("div");
    captionSection.className = "el-p";
    const caption = document.createElement("p");
    caption.textContent = "Code: Example";
    caption.style.fontSize = "16px";
    const offset = (element: HTMLElement): number => Number.parseFloat(element.style.getPropertyValue("translate").split(" ")[1] ?? "0");
    code.getBoundingClientRect = () => new DOMRect(0, 100 + offset(code), 400, 48);
    caption.getBoundingClientRect = () => new DOMRect(0, 160 + offset(caption), 160, 32);
    captionSection.append(caption);
    container.append(objectSection, captionSection);
    const context = {
      sourcePath: "note.md",
      getSectionInfo: (element: HTMLElement) => element === captionSection
        ? { text: source, lineStart: 6, lineEnd: 6 }
        : element === objectSection ? { text: source, lineStart: 3, lineEnd: 5 } : null,
    } as unknown as MarkdownPostProcessorContext;

    await processor.process(captionSection, context);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    expect([...container.children]).toEqual([objectSection, captionSection]);
    expect(caption.textContent).toBe("Code 1: Example");
    expect(objectSection.classList.contains("number-suite-caption-object")).toBe(true);
    expect(caption.style.getPropertyValue("translate")).toBe("0 -60px");
    expect(code.style.getPropertyValue("translate")).toBe("0 36px");

    await processor.process(captionSection, context);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    expect([...container.children]).toEqual([objectSection, captionSection]);
    expect(caption.textContent).toBe("Code 1: Example");
    expect(caption.style.getPropertyValue("translate")).toBe("0 -60px");

    processor.dispose();
    expect([...container.children]).toEqual([objectSection, captionSection]);
    expect(caption.textContent).toBe("Code: Example");
    expect(objectSection.classList.contains("number-suite-caption-object")).toBe(false);
    expect(caption.style.getPropertyValue("translate")).toBe("");
    expect(code.style.getPropertyValue("translate")).toBe("");
  });

  it.each(READING_CARRIER_CASES.flatMap((carrier) =>
    (["above", "below"] as const).flatMap((sourcePlacement) =>
      (["above", "below"] as const).map((displayPlacement) => ({ carrier, sourcePlacement, displayPlacement })),
    ),
  ))("places certified native $carrier.objectKind sections source-$sourcePlacement display-$displayPlacement", async ({ carrier, sourcePlacement, displayPlacement }) => {
    const objectLines = carrier.objectSource.split("\n").length;
    const imageTail = carrier.objectKind === "Figure" ? "\n^image-id" : "";
    const objectSource = carrier.objectSource + imageTail;
    // Caption kind deliberately differs from several carrier kinds.
    const source = sourcePlacement === "above"
      ? `Figure: Pair\n\n${objectSource}` : `${objectSource}\n\nFigure: Pair`;
    const { processor, container } = harness(source, settings({
      showCaptionNumbers: true, figureCaptionPlacement: displayPlacement,
    }));
    container.className = "markdown-preview-section";
    const objectSection = document.createElement("div");
    objectSection.className = carrier.objectKind === "Figure" ? "el-p"
      : carrier.objectKind === "Table" ? "el-table" : carrier.objectKind === "Equation" ? "el-div" : "el-pre";
    const wrapper = document.createElement("div");
    wrapper.style.overflow = "auto";
    if (carrier.objectKind === "Table") objectSection.style.overflow = "auto";
    const carrierRoot = carrier.createRoot();
    wrapper.append(carrierRoot);
    objectSection.append(wrapper);
    const target = carrier.objectKind === "Figure" ? carrierRoot.querySelector<HTMLElement>("img")! : carrierRoot;
    const captionSection = document.createElement("div");
    captionSection.className = "el-p";
    let caption = document.createElement("p");
    caption.textContent = "Figure: Pair";
    caption.style.fontSize = "16px";
    captionSection.append(caption);
    if (sourcePlacement === "above") container.append(captionSection, objectSection);
    else container.append(objectSection, captionSection);
    const originalOrder = [...container.children];
    const offset = (element: HTMLElement): number => Number.parseFloat(element.style.getPropertyValue("translate").split(" ")[1] ?? "0");
    const captionTop = sourcePlacement === "above" ? 100 : 160;
    const objectTop = sourcePlacement === "above" ? 160 : 100;
    caption.getBoundingClientRect = () => new DOMRect(0, captionTop + offset(caption), 160, 32);
    target.getBoundingClientRect = () => new DOMRect(0, objectTop + offset(wrapper) + offset(objectSection), 400, 48);
    const objectStart = sourcePlacement === "above" ? 2 : 0;
    const captionLine = sourcePlacement === "above" ? 0 : objectLines + (imageTail ? 1 : 0) + 1;
    const context = {
      sourcePath: "note.md",
      getSectionInfo: (element: HTMLElement) => element === captionSection
        ? { text: source, lineStart: captionLine, lineEnd: captionLine }
        : element === objectSection ? { text: source, lineStart: objectStart, lineEnd: objectStart + objectLines - 1 + (imageTail ? 1 : 0) } : null,
    } as unknown as MarkdownPostProcessorContext;
    for (let pass = 0; pass < 3; pass += 1) {
      if (pass === 2) {
        // Native rerenders can replace the paragraph while keeping its carrier.
        caption = document.createElement("p");
        caption.textContent = "Figure: Pair";
        caption.style.fontSize = "16px";
        caption.getBoundingClientRect = () => new DOMRect(0, captionTop + offset(caption), 160, 32);
        captionSection.replaceChildren(caption);
      }
      await processor.process(captionSection, context);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      expect([...container.children]).toEqual(originalOrder);
      const captionRect = caption.getBoundingClientRect();
      const objectRect = target.getBoundingClientRect();
      expect(displayPlacement === "above" ? objectRect.top - captionRect.bottom : captionRect.top - objectRect.bottom).toBe(4);
      if (carrier.objectKind === "Table") {
        expect(wrapper.style.getPropertyValue("translate")).toBe("");
        expect(objectSection.style.overflow).toBe("auto");
      }
    }
    processor.dispose();
    expect(caption.textContent).toBe("Figure: Pair");
    expect(caption.style.getPropertyValue("translate")).toBe("");
    expect(wrapper.style.getPropertyValue("translate")).toBe("");
    expect(objectSection.style.getPropertyValue("translate")).toBe("");
    expect([...container.children]).toEqual(originalOrder);
  });

  it("keeps a source-below caption attached to its rendered carrier", async () => {
    const source = "![[miao.png]]\n\nFigure: Miao";
    const { processor, context, container } = harness(source, settings({
      figureCaptionPlacement: "below",
      showCaptionNumbers: true,
    }));
    const imageParagraph = document.createElement("p");
    imageParagraph.append(document.createElement("img"));
    const caption = document.createElement("p");
    caption.textContent = "Figure: Miao";
    container.append(imageParagraph, caption);

    await processor.process(container, context);

    expect([...container.children]).toEqual([imageParagraph, caption]);
    expect(caption.textContent).toBe("Figure 1: Miao");
    expect(caption.dataset.numberSuiteCaptionPlacement).toBe("below");
    expect(imageParagraph.classList.contains("number-suite-caption-object")).toBe(true);
  });

  it.each([
    { lineStart: 0, lineEnd: 2, codeCount: 1 },
    { lineStart: 3, lineEnd: 6, codeCount: 1 },
    { lineStart: 3, lineEnd: 5, codeCount: 2 },
  ])("refuses an uncertified neighboring code section: %j", async ({ lineStart, lineEnd, codeCount }) => {
    const source = "---\ntitle: Example\n---\n```js\nconst x = 1;\n```\nCode: Example";
    const { processor, container } = harness(source, settings({ showCaptionNumbers: true }));
    container.className = "markdown-preview-section";
    const objectSection = document.createElement("div");
    objectSection.className = "el-pre";
    for (let index = 0; index < codeCount; index += 1) objectSection.append(document.createElement("pre"));
    const captionSection = document.createElement("div");
    captionSection.className = "el-p";
    const caption = document.createElement("p");
    caption.textContent = "Code: Example";
    captionSection.append(caption);
    container.append(objectSection, captionSection);
    const context = {
      sourcePath: "note.md",
      getSectionInfo: (element: HTMLElement) => element === captionSection
        ? { text: source, lineStart: 6, lineEnd: 6 }
        : { text: source, lineStart, lineEnd },
    } as unknown as MarkdownPostProcessorContext;

    await processor.process(captionSection, context);
    expect([...container.children]).toEqual([objectSection, captionSection]);
    expect(objectSection.classList.contains("number-suite-caption-object")).toBe(false);
    processor.dispose();
  });

  it.each((['above', 'below'] as const).flatMap((sourcePlacement) => (
    [false, true].map((withBreak) => ({ sourcePlacement, withBreak }))
  )))(
    "enhances and restores a source-$sourcePlacement zero-gap shared paragraph withBreak=$withBreak",
    async ({ sourcePlacement, withBreak }) => {
      const source = sourcePlacement === "above"
        ? "Figure: Miao\n![[miao.png]]"
        : "![[miao.png]]\nFigure: Miao";
      const { processor, context, container } = harness(source, settings({
        showCaptionNumbers: true,
      }));
      const sharedParagraph = document.createElement("p");
      const image = document.createElement("img");
      const separator = withBreak ? document.createElement("br") : null;
      if (sourcePlacement === "above") {
        sharedParagraph.append("Figure: Miao");
        if (separator != null) sharedParagraph.append(separator);
        sharedParagraph.append(image);
      } else {
        sharedParagraph.append(image);
        if (separator != null) sharedParagraph.append(separator);
        sharedParagraph.append("Figure: Miao");
      }
      container.append(sharedParagraph);

      await processor.process(container, context);

      const renderedCaption = container.querySelector<HTMLElement>(
        "[data-number-suite-caption-kind='Figure']",
      );
      expect(renderedCaption).not.toBeNull();
      expect(renderedCaption?.textContent).toBe("Figure 1: Miao");
      expect([...container.children]).toEqual([renderedCaption, sharedParagraph]);
      expect(sharedParagraph.classList.contains("number-suite-caption-object")).toBe(true);

      cleanupNumberSuiteReadingDom(container);

      expect([...container.children]).toEqual([sharedParagraph]);
      expect(sharedParagraph.textContent).toBe("Figure: Miao");
      expect(sharedParagraph.contains(image)).toBe(true);
      expect(separator == null || sharedParagraph.contains(separator)).toBe(true);
      const firstIsCaption = sharedParagraph.firstChild?.textContent === "Figure: Miao";
      expect(firstIsCaption).toBe(sourcePlacement === "above");
    },
  );

  it("fails closed when a shared rendered paragraph contains extra carrier-side prose", async () => {
    const source = "![[miao.png]]\nFigure: Miao";
    const { processor, context, container } = harness(source, settings({
      showCaptionNumbers: true,
    }));
    const sharedParagraph = document.createElement("p");
    sharedParagraph.append(
      "Not a standalone image ",
      document.createElement("img"),
      document.createElement("br"),
      "Figure: Miao",
    );
    container.append(sharedParagraph);

    await processor.process(container, context);

    expect([...container.children]).toEqual([sharedParagraph]);
    expect(sharedParagraph.textContent).toBe("Not a standalone image Figure: Miao");
    expect(sharedParagraph.querySelector(".number-suite-caption-number")).toBeNull();
  });

  it("moves each bound caption kind independently and keeps unbound image alt tooltips", async () => {
    const source = [
      "Table: Results",
      "",
      "| A |",
      "| --- |",
      "| ![[cell.png|Cell image]] |",
    ].join("\n");
    const { processor, context, container } = harness(source, settings({
      tableCaptionPlacement: "below",
      showImageCaptionTooltips: true,
    }));
    const caption = document.createElement("p");
    caption.textContent = "Table: Results";
    const table = document.createElement("table");
    const image = document.createElement("img");
    image.alt = "Cell image";
    table.append(image);
    container.append(caption, table);

    await processor.process(container, context);

    expect([...container.children]).toEqual([table, caption]);
    expect(caption.dataset.numberSuiteCaptionPlacement).toBe("below");
    expect(image.dataset.numberSuiteTooltipTitle).toBe("");
    expect(image.dataset.numberSuiteTooltipBody).toBe("Cell image");
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
    ))).toEqual(["Figure", "Table", "Equation", "Code"]);
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
    expect(paragraph.querySelector("a")?.textContent).toBe("1 chapter");
    expect(crossFile.textContent).toBe("Cross @Heading");
    expect(paragraph.querySelector("a.number-suite-reference-pill")?.textContent).toBe("1 chapter");
    await processor.process(container, context);
    expect(paragraph.textContent).toBe("See 1 chapter");
  });

  it("renders semantic-reference pills even when the heading has no visible number", async () => {
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

    expect(paragraph.textContent).toBe("See Heading");
    expect(paragraph.querySelector("a.number-suite-reference-pill")?.textContent).toBe("Heading");
  });

  it("keeps an escaped ordinary link before a real same-target reference unchanged", async () => {
    const source = "# Heading\n\n\\@[[#Heading|literal]] and @[[#Heading|real]]";
    const { processor, context, container } = harness(source, settings({
      showVirtualNumbers: true,
      showCrossReferences: true,
      selectedSchemeId: "hierarchical",
    }));
    container.innerHTML = '<h1>Heading</h1><p>@<a class="internal-link" data-href="#Heading">literal</a>'
      + ' and @<a class="internal-link" data-href="#Heading">real</a></p>';
    const [literal, reference] = [...container.querySelectorAll("a")];

    await processor.process(container, context);

    expect(literal?.textContent).toBe("literal");
    expect(literal?.classList.contains("number-suite-reference-pill")).toBe(false);
    expect(reference?.textContent).toBe("1 real");
    expect(reference?.classList.contains("number-suite-reference-pill")).toBe(true);
    expect(container.querySelector("p")?.textContent).toBe("@literal and 1 real");

    await processor.process(container, context);
    expect(container.querySelector("p")?.textContent).toBe("@literal and 1 real");
    cleanupNumberSuiteReadingDom(container);
    expect(container.querySelector("p")?.textContent).toBe("@literal and @real");
  });

  it("maps repeated aliases across paragraphs and restores formatted link children", async () => {
    const source = "# Heading\n\n\\@[[#Heading|literal]]\n\n"
      + "**@[[#Heading|first]]** and @[[#Heading|second]] and [[#Heading|ordinary]]";
    const { processor, context, container } = harness(source, settings({
      showVirtualNumbers: true,
      selectedSchemeId: "hierarchical",
    }));
    container.innerHTML = '<h1>Heading</h1><p>@<a class="internal-link" data-href="#Heading">literal</a></p>'
      + '<p><strong>@<a class="internal-link" data-href="#Heading" aria-label="Original"><em>first</em></a></strong>'
      + ' and @<a class="internal-link" data-href="#Heading">second</a>'
      + ' and <a class="internal-link" data-href="#Heading">ordinary</a></p>';
    const links = [...container.querySelectorAll("a")];
    const formattedChild = links[1]?.firstChild;
    const original = [...container.querySelectorAll("p")].map((paragraph) => paragraph.innerHTML);
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await processor.process(container, context);
      expect(links.map((link) => link.textContent)).toEqual(["literal", "1 first", "1 second", "ordinary"]);
      expect(links.map((link) => link.classList.contains("number-suite-reference-pill")))
        .toEqual([false, true, true, false]);
    }

    cleanupNumberSuiteReadingDom(container);
    expect([...container.querySelectorAll("p")].map((paragraph) => paragraph.innerHTML)).toEqual(original);
    expect(links[1]?.firstChild).toBe(formattedChild);
    expect(links[1]?.getAttribute("aria-label")).toBe("Original");
  });

  it("excludes code and comments from rendered reference candidate counts", async () => {
    const source = [
      "# Heading",
      "`@[[#Heading|inline]]` <!-- @[[#Heading|html]] --> %% @[[#Heading|comment]] %%",
      "",
      "```markdown",
      "@[[#Heading|fence]]",
      "```",
      "",
      "@[[#Heading|real]]",
    ].join("\n");
    const { processor, context, container } = harness(source, settings({ showVirtualNumbers: false }));
    container.innerHTML = '<h1>Heading</h1><p><code>@[[#Heading|inline]]</code></p>'
      + '<pre><code>@[[#Heading|fence]]</code></pre>'
      + '<p>@<a class="internal-link" data-href="#Heading">real</a></p>';
    const originalCode = [...container.querySelectorAll("code")].map((code) => code.textContent);

    await processor.process(container, context);

    expect(container.querySelector("a.number-suite-reference-pill")?.textContent).toBe("real");
    expect([...container.querySelectorAll("code")].map((code) => code.textContent)).toEqual(originalCode);
  });

  it.each([
    { literal: "literal", real: "real", ordinary: "ordinary", escaped: "\\" },
    { literal: "same", real: "same", ordinary: "same", escaped: "\\" },
    { literal: "same", real: "same", ordinary: "same", escaped: "" },
  ])("rejects a same-count HTML/entity substitution with $literal/$real/$ordinary aliases and $escaped escape", async ({
    literal, real, ordinary, escaped,
  }) => {
    const source = `# Heading\n\n<code>${escaped}@[[#Heading|${literal}]]</code>`
      + ` and @[[#Heading|${real}]] and &#64;[[#Heading|${ordinary}]]`;
    const { processor, context, container } = harness(source, settings({ showVirtualNumbers: false }));
    container.innerHTML = `<h1>Heading</h1><p><code>@[[#Heading|${literal}]]</code>`
      + ` and @<a class="internal-link" data-href="#Heading">${real}</a>`
      + ` and @<a class="internal-link" data-href="#Heading">${ordinary}</a></p>`;
    const original = container.querySelector("p")?.innerHTML;

    await processor.process(container, context);

    expect(container.querySelector(".number-suite-reference-pill")).toBeNull();
    expect(container.querySelector("p")?.innerHTML).toBe(original);
  });

  it("keeps ordinary entity text and entity-prefixed wiki links compatible with verified references", async () => {
    const source = "# Heading\n\nA &amp; B, &#64;[[#Heading|ordinary]], @[[#Heading|real]]";
    const { processor, context, container } = harness(source, settings({ showVirtualNumbers: false }));
    container.innerHTML = '<h1>Heading</h1><p>A &amp; B, @<a class="internal-link" data-href="#Heading">ordinary</a>'
      + ', @<a class="internal-link" data-href="#Heading">real</a></p>';
    const [ordinary, reference] = [...container.querySelectorAll("a")];

    await processor.process(container, context);

    expect(ordinary?.classList.contains("number-suite-reference-pill")).toBe(false);
    expect(reference?.classList.contains("number-suite-reference-pill")).toBe(true);
    expect(container.querySelector("p")?.textContent).toBe("A & B, @ordinary, real");
  });

  it("preserves native references in a section containing an original HTML block", async () => {
    const source = "# Heading\n\n<div>\nRaw HTML\n</div>\n\n@[[#Heading|real]]";
    const { processor, context, container } = harness(source, settings({ showVirtualNumbers: false }));
    container.innerHTML = '<h1>Heading</h1><div>Raw HTML</div>'
      + '<p>@<a class="internal-link" data-href="#Heading">real</a></p>';
    const paragraph = container.querySelector("p")!;
    const original = paragraph.innerHTML;

    await processor.process(container, context);

    expect(container.querySelector(".number-suite-reference-pill")).toBeNull();
    expect(paragraph.innerHTML).toBe(original);
    await processor.process(paragraph, {
      ...context,
      getSectionInfo: () => ({ text: source, lineStart: 6, lineEnd: 6 }),
    });
    expect(paragraph.querySelector("a.number-suite-reference-pill")?.textContent).toBe("real");
  });

  it("keeps HTML examples inside Markdown fences out of the unsafe section gate", async () => {
    const source = "# Heading\n\n```html\n<div>\n@[[#Heading|example]]\n</div>\n```\n\n@[[#Heading|real]]";
    const { processor, context, container } = harness(source, settings({ showVirtualNumbers: false }));
    container.innerHTML = '<h1>Heading</h1><pre><code>&lt;div&gt;\n@[[#Heading|example]]\n&lt;/div&gt;</code></pre>'
      + '<p>@<a class="internal-link" data-href="#Heading">real</a></p>';
    const originalCode = container.querySelector("code")?.innerHTML;

    await processor.process(container, context);

    expect(container.querySelector("a.number-suite-reference-pill")?.textContent).toBe("real");
    expect(container.querySelector("code")?.innerHTML).toBe(originalCode);
  });

  it.each([1, 3])("leaves a target unchanged when its two source candidates render as %s links", async (count) => {
    const source = "# Heading\n\n\\@[[#Heading|literal]] and @[[#Heading|real]]";
    const { processor, context, container } = harness(source, settings({ showVirtualNumbers: false }));
    container.innerHTML = "<h1>Heading</h1><p>"
      + Array.from({ length: count }, (_, index) => (
        `@<a class="internal-link" data-href="#Heading">link ${index}</a>`
      )).join(" and ") + "</p>";
    const original = container.querySelector("p")?.innerHTML;

    await processor.process(container, context);

    expect(container.querySelector(".number-suite-reference-pill")).toBeNull();
    expect(container.querySelector("p")?.innerHTML).toBe(original);
  });

  it("binds reference source order before moving a caption across a table", async () => {
    const source = "# Heading\n\nFigure: First @[[#Heading|caption]]\n\n"
      + "| A |\n| --- |\n| @[[#Heading|cell]] |";
    const { processor, context, container } = harness(source, settings({
      showVirtualNumbers: false,
      figureCaptionPlacement: "below",
    }));
    container.innerHTML = '<h1>Heading</h1><p>Figure: First @<a class="internal-link" data-href="#Heading">caption</a></p>'
      + '<table><tbody><tr><td>@<a class="internal-link" data-href="#Heading">cell</a></td></tr></tbody></table>';
    const caption = container.querySelector("p");
    const table = container.querySelector("table");
    const originalCaption = caption?.innerHTML;
    const originalTable = table?.innerHTML;

    await processor.process(container, context);

    expect(caption?.previousElementSibling).toBe(table);
    expect(caption?.querySelector("a.number-suite-reference-pill")?.textContent).toBe("caption");
    expect(table?.querySelector("a.number-suite-reference-pill")?.textContent).toBe("cell");
    cleanupNumberSuiteReadingDom(container);
    expect(caption?.nextElementSibling).toBe(table);
    expect(caption?.innerHTML).toBe(originalCaption);
    expect(table?.innerHTML).toBe(originalTable);
  });

  it("resolves a unique caption title without requiring a block ID", async () => {
    const { processor, context, container, navigation } = harness(
      "Figure: Miao\nSee @[[#Figure: Miao]]",
      settings({ showCaptionNumbers: true, showCrossReferences: true }),
    );
    const caption = document.createElement("p");
    caption.textContent = "Figure: Miao";
    const paragraph = document.createElement("p");
    paragraph.append("See @");
    const link = document.createElement("a");
    link.className = "internal-link";
    link.dataset.href = "#Figure: Miao";
    link.textContent = "Figure: Miao";
    paragraph.append(link);
    container.append(caption, paragraph);

    await processor.process(container, context);

    expect(caption.textContent).toBe("Figure 1: Miao");
    expect(link.textContent).toBe("Figure 1: Miao");
    expect(link.classList.contains("number-suite-reference-pill")).toBe(true);
    expect(link.dataset.numberSuiteReferenceLine).toBe("0");

    link.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(navigation.setEphemeralState).toHaveBeenCalledWith({ line: 0 });
    expect(navigation.revealLeaf).toHaveBeenCalled();
    expect(navigation.setCursor).toHaveBeenCalledWith({ line: 0, ch: 0 });
    expect(navigation.scrollIntoView).toHaveBeenCalled();
    expect(navigation.focus).toHaveBeenCalled();
    expect(navigation.openFile).not.toHaveBeenCalled();
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

  it.each([true, false])("ignores nested note-body lists with definition classes: %s", async (classified) => {
    const source = "Foot[^a] and end[^endnote:x].\n\n[^a]: Footnote\n    - Nested item\n[^endnote:x]: Endnote";
    const { processor, context, container } = harness(source, settings({ showNoteNumbers: true }));
    const itemClass = classified ? ' class="footnote-item"' : "";
    container.innerHTML = '<p>Foot<sup class="footnote-ref"><a>[1]</a></sup>'
      + ' and end<sup class="footnote-ref"><a>[2]</a></sup>.</p>'
      + `<section class="footnotes"><ol><li${itemClass}>Footnote<ul><li value="7">Nested item</li></ul></li>`
      + `<li${itemClass}>Endnote</li></ol></section>`;
    const definitions = [...container.querySelectorAll<HTMLElement>("section.footnotes > ol > li")];
    const nested = container.querySelector<HTMLElement>("ul > li");

    await processor.process(container, context);

    expect([...container.querySelectorAll("sup a")].map((link) => link.textContent)).toEqual(["[1]", "[E1]"]);
    expect(definitions.map((item) => item.dataset.numberSuiteNoteLabel)).toEqual(["1", "E1"]);
    expect(definitions.map((item) => item.getAttribute("value"))).toEqual(["1", "1"]);
    expect(nested?.getAttribute("value")).toBe("7");
    expect(nested?.dataset.numberSuiteNoteLabel).toBeUndefined();

    cleanupNumberSuiteReadingDom(container);
    expect(definitions.map((item) => item.getAttribute("value"))).toEqual([null, null]);
    expect(nested?.getAttribute("value")).toBe("7");
    expect([...container.querySelectorAll("sup a")].map((link) => link.textContent)).toEqual(["[1]", "[2]"]);
  });

  it("fully restores note ARIA, list values, captions, and headings during unload cleanup", async () => {
    const source = "# Heading\nFigure: Caption\nSee @[[#Heading|section]]\nNote[^a].\n\n[^a]: A";
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
    paragraph.append("See @");
    const reference = document.createElement("a");
    reference.className = "internal-link";
    reference.dataset.href = "#Heading";
    reference.textContent = "section";
    reference.setAttribute("aria-label", "Native heading link");
    paragraph.append(reference, document.createElement("br"), "Note");
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
    expect(reference.textContent).toBe("section");
    expect(reference.classList.contains("number-suite-reference-pill")).toBe(true);
    expect(paragraph.textContent).not.toContain("@");

    cleanupNumberSuiteReadingDom(container);

    expect(link.textContent).toBe("[7]");
    expect(link.getAttribute("aria-label")).toBe("Native note label");
    expect(link.dataset.numberSuiteNoteAriaPresent).toBeUndefined();
    expect(link.dataset.numberSuiteNoteAriaOriginal).toBeUndefined();
    expect(item.getAttribute("value")).toBe("7");
    expect(item.dataset.numberSuiteNoteLabel).toBeUndefined();
    expect(caption.classList.contains("number-suite-caption-centered")).toBe(false);
    expect(caption.dataset.numberSuiteCaptionKind).toBeUndefined();
    expect(paragraph.textContent).toContain("See @section");
    expect(reference.textContent).toBe("section");
    expect(reference.getAttribute("aria-label")).toBe("Native heading link");
    expect(reference.classList.contains("number-suite-reference-pill")).toBe(false);
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
