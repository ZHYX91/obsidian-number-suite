// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { defineLanguageFacet, forceParsing, Language } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { parser } from "@lezer/markdown";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editorLivePreviewField, TFile, type App, type MarkdownPostProcessorContext } from "obsidian";

const host = vi.hoisted(() => ({ parsed: {} as Record<string, unknown> }));

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("obsidian")>(),
  getFrontMatterInfo: (source: string) => {
    const end = source.indexOf("\n---", 4);
    return { exists: true, frontmatter: source.slice(4, end), from: 0, to: end + 4, contentStart: end + 5 };
  },
  parseYaml: () => host.parsed,
}));

import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { createSourcePlan } from "../../src/commands/transform-options";
import { HeadingDisplayController } from "../../src/editor/heading-display-extension";
import { HeadingReadingProcessor } from "../../src/reading/heading-postprocessor";
import { createNativeOutlineProjection } from "../../src/integration/native-outline-projection";

const configured = { ...DEFAULT_SETTINGS, showVirtualNumbers: true, selectedSchemeId: "hierarchical" };
const views: EditorView[] = [];

beforeEach(() => {
  window.Node.prototype.createSpan = function createSpan(options?: string | DomElementInfo): HTMLSpanElement {
    const span = document.createElement("span");
    if (typeof options === "string") span.className = options;
    else if (options?.cls != null) span.className = Array.isArray(options.cls) ? options.cls.join(" ") : options.cls;
    this.appendChild(span);
    return span;
  };
  Object.defineProperty(document, "win", { configurable: true, value: window });
  Object.assign(window, { createFragment: () => document.createDocumentFragment() });
});

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy());
  document.body.replaceChildren();
});

const cases = [
  { name: "quoted key", yaml: "'number-suite': [heading.virtual=true]", parsed: { "number-suite": ["heading.virtual=true"] }, valid: false },
  { name: "duplicate key", yaml: "number-suite: [heading.virtual=false]\nnumber-suite: [heading.virtual=true]", parsed: { "number-suite": ["heading.virtual=true"] }, valid: false },
  { name: "duplicate legacy key", yaml: "number-suite-show-virtual: false\nnumber-suite-show-virtual: true", parsed: { "number-suite-show-virtual": true }, valid: false },
  { name: "conflicting legacy value", yaml: "number-suite: [heading.virtual=true]\nnumber-suite-show-virtual: false", parsed: { "number-suite": ["heading.virtual=true"], "number-suite-show-virtual": false }, valid: false },
  { name: "unknown directive", yaml: "number-suite: [unknown=true]", parsed: { "number-suite": ["unknown=true"] }, valid: false },
  { name: "invalid value", yaml: "number-suite: [heading.virtual=maybe]", parsed: { "number-suite": ["heading.virtual=maybe"] }, valid: false },
  { name: "valid property", yaml: "number-suite: [heading.virtual=true]", parsed: { "number-suite": ["heading.virtual=true"] }, valid: true },
];

describe("source Properties validation at display entry points", () => {
  it.each([{ root: ["list"] }, { root: "scalar" }, { root: 7 }, { root: null }, { root: new Date("2026-01-01") }])("refuses a non-mapping Properties root across note controls and writes", async ({ root }) => {
    const { parseFrontmatterRecordFromSource } = await import("../../src/config/frontmatter-source");
    host.parsed = root as unknown as Record<string, unknown>;
    const source = "---\nmalformed properties\n---\n# Title";
    expect(parseFrontmatterRecordFromSource(source)).toBeNull();
    expect(createSourcePlan(source, "write", configured)).toEqual({ status: "invalid-frontmatter", plan: null });
  });
  it.each(["", "# A comment\n  # Another"])("accepts empty and comment-only Properties", async (yaml) => {
    const { parseFrontmatterRecordFromSource } = await import("../../src/config/frontmatter-source");
    host.parsed = null as unknown as Record<string, unknown>;
    expect(parseFrontmatterRecordFromSource(`---\n${yaml}\n---\n# Title`)).toEqual({});
  });
  type SkipFixture = { fileName: string; h2Start: number | null; labels: [string, string][] };
  const fixtures: SkipFixture[] = [
    { fileName: "Section skip rules.md", h2Start: null, labels: [["## 试用总结", "4"], ["### 下一步", "4.1"]] },
    ...[1, 2].map((start): SkipFixture => ({
      fileName: "Two chapter skip rules.md", h2Start: start === 1 ? null : start,
      labels: [
        ["# 第一章", "1"], ["## 研究背景", `1.${start}`], ["### 背景小结", `1.${start}.1`],
        ["# 第二章", "2"], ["## 实验设计", `2.${start}`], ["### 实验步骤", `2.${start}.1`],
      ],
    })),
  ];
  it.each(fixtures)("matches both views, native Outline and the write preview for $fileName (H2 start $h2Start)", async ({ fileName, h2Start, labels }) => {
    const original = readFileSync(`acceptance/fixtures/${fileName}`, "utf8");
    const source = h2Start == null ? original : original.replace("number-suite:\n", `number-suite:\n  - heading.first-number.h2=${h2Start}\n`);
    host.parsed = { "number-suite": source.split("\n").filter((line) => line.startsWith("  - ")).map((line) => line.slice(4)) };
    const parent = document.body.appendChild(document.createElement("div"));
    const controller = new HeadingDisplayController(() => configured);
    const view = new EditorView({ parent, state: EditorState.create({
      doc: source, selection: { anchor: source.length },
      extensions: [new Language(defineLanguageFacet(), parser), editorLivePreviewField, controller.createExtension()],
    }) });
    views.push(view);
    expect(forceParsing(view, source.length, 1000)).toBe(true);
    const lines = source.split("\n");
    const expected = labels.map(([heading, number]) => [lines.indexOf(heading), number]);
    expect([...createNativeOutlineProjection(source, [], configured).numberLabels]).toEqual(expected);
    const preview = createSourcePlan(source, "write", configured).plan;
    expect(preview?.changes.map(({ line, after }) => [line, after])).toEqual(
      labels.map(([heading, number]) => [lines.indexOf(heading), `${number} ${heading.replace(/^#+ /u, "")}`]),
    );
    expect([...parent.querySelectorAll(".number-suite-heading-number")].map((element) => [
      view.state.doc.lineAt(view.posAtDOM(element)).number - 1, element.textContent?.trim(),
    ])).toEqual(expected);
    expect(view.state.doc.toString()).toBe(source);
    const file = new (TFile as unknown as new (path: string) => TFile)(fileName);
    const app = { vault: { getAbstractFileByPath: () => file, cachedRead: async () => source } } as unknown as App;
    const processor = new HeadingReadingProcessor(app, () => configured);
    const reading = document.body.appendChild(document.createElement("div"));
    for (const [index, line] of lines.entries()) {
      const heading = /^(#{1,6}) (.+)$/u.exec(line);
      if (!heading) continue;
      const element = reading.appendChild(document.createElement(`h${heading[1]!.length}`));
      element.textContent = heading[2]!;
      element.dataset.line = String(index);
    }
    await processor.process(reading, {
      sourcePath: file.path, frontmatter: host.parsed,
      getSectionInfo: () => ({ text: source, lineStart: 0, lineEnd: lines.length - 1 }),
    } as unknown as MarkdownPostProcessorContext);
    expect([...reading.querySelectorAll(".number-suite-heading-number")].map((element) => [
      Number(element.parentElement?.dataset.line), element.textContent?.trim(),
    ])).toEqual(expected);
    processor.dispose();
  });

  it("shows short Live Preview headings and full numbered references without changing the note", () => {
    host.parsed = {};
    const source = "# Chapter\n## Detail\n\nSee [[#Detail|Guide]] and @[[#Detail|Guide]]\n\nEnd";
    const parent = document.body.appendChild(document.createElement("div"));
    const controller = new HeadingDisplayController(() => ({
      ...configured, bodyHeadingNumberFormat: "current-only", enhanceNativeWikiHeadingLinks: true,
    }));
    const view = new EditorView({ parent, state: EditorState.create({
      doc: source, selection: { anchor: source.length },
      extensions: [new Language(defineLanguageFacet(), parser), editorLivePreviewField, controller.createExtension()],
    }) });
    views.push(view);
    expect([...parent.querySelectorAll(".number-suite-heading-number")].map((pill) => pill.textContent?.trim()))
      .toEqual(["1", "1"]);
    expect(parent.querySelector(".number-suite-native-wiki-number")?.textContent?.trim()).toBe("1.1");
    expect(parent.querySelector(".number-suite-reference-pill")?.textContent).toBe("1.1 Guide");
    expect(view.state.doc.toString()).toBe(source);
  });

  it.each([
    { official: true, manual: false, kinds: ["stored", "stored", "stored"] },
    { official: false, manual: false, kinds: [null, "stored", null] },
    { official: false, manual: true, kinds: ["manual", "stored", "manual"] },
  ])("uses the same Chinese prefix boundaries in Live Preview, Reading View and Outline ($official, $manual)", async ({ official, manual, kinds }) => {
    host.parsed = {};
    const titles = ["一、你好", "一、　 你好", "一、二、三"];
    const source = titles.map((title, i) => `${i === 0 ? "#" : "##"} ${title}`).join("\n") + "\n\nBody";
    const settings = {
      ...configured, showVirtualNumbers: false, concealStoredNumbers: false,
      storedHeadingNumberStyleScope: manual ? "common" as const : "templates" as const,
      disabledBuiltInSchemeIds: official ? [] : ["chinese-official"],
      customSchemes: [{
        id: "custom-spaced", name: "Spaced", baseLevel: 1 as const, revision: 1,
        templates: ["{1.chinese_lower}、 ", "", "", "", "", "", "", "", ""], exclusions: [],
      }],
    };
    const parent = document.body.appendChild(document.createElement("div"));
    const controller = new HeadingDisplayController(() => settings);
    const view = new EditorView({ parent, state: EditorState.create({
      doc: source, selection: { anchor: source.length },
      extensions: [new Language(defineLanguageFacet(), parser), editorLivePreviewField, controller.createExtension()],
    }) });
    views.push(view);
    const reading = document.body.appendChild(document.createElement("div"));
    titles.forEach((text, index) => {
      const heading = document.createElement(index === 0 ? "h1" : "h2");
      heading.textContent = text;
      reading.append(heading);
    });
    const file = new (TFile as unknown as new (path: string) => TFile)("Chinese.md");
    const app = { vault: { getAbstractFileByPath: () => file, cachedRead: async () => source } } as unknown as App;
    const processor = new HeadingReadingProcessor(app, () => settings);
    await processor.process(reading, {
      sourcePath: file.path, frontmatter: {}, getSectionInfo: () => ({ text: source, lineStart: 0, lineEnd: 4 }),
    } as unknown as MarkdownPostProcessorContext);
    for (const surface of [parent, reading]) {
      const pills = [...surface.querySelectorAll(".number-suite-stored-heading-number")];
      expect(pills.map((pill) => pill.classList.contains("is-manual") ? "manual" : "stored"))
        .toEqual(kinds.filter((kind) => kind != null));
      expect(pills.every((pill) => pill.textContent === "一、")).toBe(true);
    }
    const outline = createNativeOutlineProjection(source, [], settings);
    expect(titles.map((_, i) => outline.numberKinds?.get(i) ?? null)).toEqual(kinds);
    expect(outline.titleLabels?.get(2)).toBe(kinds[2] == null ? "一、二、三" : "二、三");
    expect(view.state.doc.toString()).toBe(source);
    processor.dispose();
  });

  it("restores visible manual pills after leaving the active Live Preview heading", () => {
    host.parsed = {};
    const source = "## 3) Paper patterns\n\nBody";
    const parent = document.body.appendChild(document.createElement("div"));
    const controller = new HeadingDisplayController(() => ({
      ...configured,
      concealStoredNumbers: true,
      storedHeadingNumberStyleScope: "common",
    }));
    const view = new EditorView({ parent, state: EditorState.create({
      doc: source, selection: { anchor: source.length },
      extensions: [new Language(defineLanguageFacet(), parser), editorLivePreviewField, controller.createExtension()],
    }) });
    views.push(view);
    const manualPill = () => parent.querySelector(".number-suite-stored-heading-number.is-manual");
    expect(manualPill()?.getAttribute("aria-label")).toBe("3) — Common handwritten heading number");
    expect(parent.querySelector(".number-suite-heading-number")?.getAttribute("aria-label"))
      .toBe("1.1 — Virtual heading number");
    view.dispatch({ selection: { anchor: 4 } });
    expect(manualPill()).toBeNull();
    view.dispatch({ selection: { anchor: source.length } });
    expect(manualPill()?.textContent).toBe("3)");
    expect(view.state.doc.toString()).toBe(source);
  });

  it.each([
    { globalScope: "templates", noteScope: null, manualVisible: true },
    { globalScope: "templates", noteScope: "common", manualVisible: false },
    { globalScope: "common", noteScope: "templates", manualVisible: true },
  ] as const)("applies per-note concealment ($noteScope over $globalScope) in body and Outline", async ({ globalScope, noteScope, manualVisible }) => {
    const entries = ["heading.hide-stored=true"];
    if (noteScope != null) entries.push(`heading.hide-stored-scope=${noteScope}`);
    host.parsed = { "number-suite": entries };
    const source = ["---", "number-suite:", ...entries.map((entry) => `  - ${entry}`), "---",
      "# 7 Lantern archive", "## 3) Paper patterns", "", "Body"].join("\n");
    const overrides = {
      ...configured,
      concealStoredNumbers: false,
      concealScope: globalScope,
      storedHeadingNumberStyleScope: "common" as const,
    };
    const parent = document.body.appendChild(document.createElement("div"));
    const controller = new HeadingDisplayController(() => overrides);
    const view = new EditorView({ parent, state: EditorState.create({
      doc: source, selection: { anchor: source.length },
      extensions: [new Language(defineLanguageFacet(), parser), editorLivePreviewField, controller.createExtension()],
    }) });
    views.push(view);
    const reading = document.body.appendChild(document.createElement("div"));
    reading.append(document.createElement("h1"), document.createElement("h2"));
    reading.children[0]!.textContent = "7 Lantern archive";
    reading.children[1]!.textContent = "3) Paper patterns";
    const file = new (TFile as unknown as new (path: string) => TFile)("Lantern archive.md");
    const app = { vault: { getAbstractFileByPath: () => file, cachedRead: async () => source } } as unknown as App;
    const processor = new HeadingReadingProcessor(app, () => overrides);
    await processor.process(reading, {
      sourcePath: file.path, frontmatter: host.parsed,
      getSectionInfo: () => ({ text: source, lineStart: 0, lineEnd: source.split("\n").length - 1 }),
    } as unknown as MarkdownPostProcessorContext);
    for (const surface of [parent, reading]) {
      expect([...surface.querySelectorAll(".number-suite-heading-number")].map((pill) => pill.textContent?.trim()))
        .toEqual(["1", "1.1"]);
      expect(surface.querySelector(".number-suite-stored-heading-number.is-manual")?.textContent ?? null)
        .toBe(manualVisible ? "3)" : null);
      expect(surface.querySelector(".number-suite-stored-heading-number.is-stored")).toBeNull();
    }
    const outline = createNativeOutlineProjection(source, [], overrides);
    expect([...outline.numberLabels.values()]).toEqual(["1", "1.1"]);
    expect([...outline.secondaryStoredNumbers?.values() ?? []])
      .toEqual(manualVisible ? [{ label: "3)", kind: "manual" }] : []);
    expect(view.state.doc.toString()).toBe(source);
    processor.dispose();
  });

  it.each(cases)("keeps command, Live Preview and Reading View consistent for $name", async ({ yaml, parsed, valid }) => {
    host.parsed = parsed;
    const source = `---\n${yaml}\n---\n# Heading\n\n####### Extended\n\nBody`;
    expect(createSourcePlan(source, "write", configured).status).toBe(valid ? "ready" : "invalid-properties");

    const parent = document.createElement("div");
    document.body.append(parent);
    const controller = new HeadingDisplayController(() => configured);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: source,
        selection: { anchor: source.length },
        extensions: [editorLivePreviewField, controller.createExtension()],
      }),
    });
    views.push(view);
    expect(parent.querySelector(".number-suite-heading-number") != null).toBe(valid);
    expect(view.state.doc.toString()).toBe(source);

    const FileConstructor = TFile as unknown as new (path: string) => TFile;
    const file = new FileConstructor("note.md");
    const app = { vault: { getAbstractFileByPath: () => file, cachedRead: async () => source } } as unknown as App;
    const processor = new HeadingReadingProcessor(app, () => configured);
    const container = document.createElement("div");
    const heading = document.createElement("h1");
    heading.textContent = "Heading";
    container.append(heading);
    document.body.append(container);
    const headingLine = source.split("\n").indexOf("# Heading");
    const context = {
      sourcePath: file.path,
      frontmatter: parsed,
      getSectionInfo: () => ({ text: source, lineStart: headingLine, lineEnd: headingLine }),
    } as unknown as MarkdownPostProcessorContext;
    await processor.process(container, context);
    expect(container.querySelector(".number-suite-heading-number") != null).toBe(valid);
    processor.dispose();
    expect(heading.textContent).toBe("Heading");
  });
});

it("adds heading labels when a parse-only transaction completes the syntax tree", async () => {
  const { syntaxTreeAvailable } = await import("@codemirror/language");
  host.parsed = {};
  const source = "---\ntitle: Test\n---\n" + "a".repeat(3300) + "\n\n# One\n\n## Two\n\nBody";
  const parent = document.body.appendChild(document.createElement("div"));
  const controller = new HeadingDisplayController(() => configured);
  const view = new EditorView({ parent, state: EditorState.create({
    doc: source, selection: { anchor: source.length },
    extensions: [new Language(defineLanguageFacet(), parser), editorLivePreviewField, controller.createExtension()],
  }) });
  views.push(view);
  expect(syntaxTreeAvailable(view.state)).toBeFalsy();
  expect(parent.querySelector(".number-suite-heading-number")).toBeNull();
  expect(forceParsing(view, source.length, 1000)).toBe(true);
  expect([...parent.querySelectorAll(".number-suite-heading-number")].map((pill) => pill.textContent?.trim()))
    .toEqual(["1", "1.1"]);
});
