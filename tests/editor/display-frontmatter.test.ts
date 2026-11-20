// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { defineLanguageFacet, Language } from "@codemirror/language";
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
  window.Node.prototype.createSpan = function createSpan(): HTMLSpanElement {
    const span = document.createElement("span");
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
  it("uses the same section skips in both note views, native Outline and the write preview", async () => {
    const source = readFileSync("acceptance/fixtures/Section skip rules.md", "utf8");
    host.parsed = { "number-suite": ["heading.virtual=true", "heading.scheme=hierarchical-h2", "heading.first-number.h2=4", "heading.skip-first.h2=1"] };
    const parent = document.body.appendChild(document.createElement("div"));
    const controller = new HeadingDisplayController(() => configured);
    const view = new EditorView({ parent, state: EditorState.create({
      doc: source, selection: { anchor: source.length },
      extensions: [new Language(defineLanguageFacet(), parser), editorLivePreviewField, controller.createExtension()],
    }) });
    views.push(view);
    const lines = source.split("\n");
    const summaryLine = lines.indexOf("## 试用总结");
    const nextLine = lines.indexOf("### 下一步");
    const expected = [[summaryLine, "4"], [nextLine, "4.1"]];
    expect([...createNativeOutlineProjection(source, [], configured).numberLabels]).toEqual(expected);
    const preview = createSourcePlan(source, "write", configured).plan;
    expect(preview?.changes.map(({ line, after }) => [line, after])).toEqual([
      [summaryLine, "4 试用总结"], [nextLine, "4.1 下一步"],
    ]);
    expect([...parent.querySelectorAll(".number-suite-heading-number")].map((element) => [
      view.state.doc.lineAt(view.posAtDOM(element)).number - 1, element.textContent?.trim(),
    ])).toEqual(expected);
    expect(view.state.doc.toString()).toBe(source);
    const file = new (TFile as unknown as new (path: string) => TFile)("Section skip rules.md");
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
