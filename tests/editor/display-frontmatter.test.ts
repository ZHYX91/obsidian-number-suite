// @vitest-environment happy-dom

import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
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
