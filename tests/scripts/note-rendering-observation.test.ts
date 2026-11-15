// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { Decoration, WidgetType } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

const fixture = readFileSync("acceptance/fixtures/Link metadata boundaries.md");
const provider = readFileSync("acceptance/fixtures/.obsidian/plugins/number-suite-acceptance-provider/main.js", "utf8");

afterEach(() => document.body.replaceChildren());

function harness() {
  const source = fixture.toString("utf8");
  const from = source.indexOf("[^real]:");
  class NoteWidget extends WidgetType {
    readonly kind = "note-definition";
    readonly label = "1";
    override toDOM(): HTMLElement { throw new Error("Observation must not render widgets"); }
  }
  const productSet = Decoration.set([Decoration.replace({ widget: new NoteWidget() }).range(from, from + 7)]);
  const nativeSet = Decoration.set([Decoration.replace({}).range(from, from + 8)]);
  const root = document.createElement("div");
  root.innerHTML = '<div class="cm-editor"><div class="cm-content"><div class="cm-line">The ordinary visible reference is first.</div></div></div>';
  document.body.append(root);
  Object.defineProperty(window, "crypto", { configurable: true, value: webcrypto });
  const state = {
    doc: { toString: () => source },
    selection: { ranges: [{ from: source.length, to: source.length }] },
    field: () => true,
    facet: () => [nativeSet, () => { throw new Error("Observation must not invoke decoration providers"); }],
  };
  const cm = {
    state, dom: root.querySelector(".cm-editor")!, contentDOM: root.querySelector(".cm-content")!,
    docView: { decorations: [nativeSet, productSet], dynamicDecorationMap: [false, true] },
    plugins: [{ value: { decorations: productSet }, spec: { plugin: { id: 7 } }, mustUpdate: null }],
    composing: false, hasFocus: false, posAtDOM: () => from,
    dispatch: () => { throw new Error("Observation must not dispatch"); },
  };
  const active = { file: { path: "Link metadata boundaries.md" }, getMode: () => "source", contentEl: root };
  const marker = { kind: "obsidian-plugin-acceptance-vault", schemaVersion: 3, pluginId: "number-suite", state: "runtime-ready",
    runId: "synthetic-test", runtimeReadiness: { expectedPlugins: [{ id: "number-suite" }] } };
  const writes: Array<{ path: string; content: string }> = [];
  const app = {
    workspace: { getActiveViewOfType: () => active },
    vault: {
      readBinary: async () => fixture,
      adapter: {
        exists: async (path: string) => path === ".obsidian-acceptance/marker.json",
        read: async () => JSON.stringify(marker),
        write: async (path: string, content: string) => { writes.push({ path, content }); },
      },
    },
    plugins: { getPlugin: () => ({ manifest: { version: "0.6.5" }, settings: {
      showNoteNumbers: true, noteDisplayMode: "formatted", enableLivePreview: true,
    } }) },
  };
  const module = { exports: {} as { recordNoteRendering: (app: object, stage: string) => Promise<void> } };
  runInNewContext(`${provider}\nmodule.exports.recordNoteRendering = recordNoteRendering;`, {
    module, TextEncoder, Date,
    require: (name: string) => {
      if (name === "obsidian") return { Plugin: class {}, Notice: class {}, Modal: class {}, MarkdownView: class {} };
      if (name === "@codemirror/view") return { EditorView: { findFromDOM: () => cm, decorations: "facet" } };
      throw new Error(`Unexpected diagnostic import: ${name}`);
    },
  });
  return { record: (stage = "initial") => module.exports.recordNoteRendering(app, stage), writes, state, cm, app, active, marker };
}

describe("isolated note rendering observation", () => {
  it("pins diagnostics to the exact synthetic fixture", () => {
    const expected = /const NOTE_FIXTURE_SHA256 = "([a-f\d]+)"/u.exec(provider)?.[1];
    expect(expected).toBe(createHash("sha256").update(fixture).digest("hex"));
  });

  it("records ordered hidden/native and product ranges without rendering or refreshing", async () => {
    const setup = harness();
    await setup.record();
    expect(setup.writes).toHaveLength(1);
    expect(setup.writes[0]?.path).toBe("number-suite-note-rendering-initial.json");
    const record = JSON.parse(setup.writes[0]!.content) as {
      renderedSets: Array<{ index: number; definitions: { ranges: Array<{ widget: unknown }> } }>;
      plugins: Array<{ renderedSetIndex: number }>;
      sourceSha256: string; sourceSha256After: string; productAcceptance: boolean;
      dom: { noteWidgets: unknown[] }; selection: Array<{ from: number; to: number }>;
    };
    expect(record.renderedSets.map((set) => set.index)).toEqual([0, 1]);
    expect(record.renderedSets[0]?.definitions.ranges[0]?.widget).toBeNull();
    expect(record.renderedSets[1]?.definitions.ranges[0]?.widget).toMatchObject({ kind: "note-definition", label: "1" });
    expect(record.plugins[0]?.renderedSetIndex).toBe(1);
    expect(record.dom.noteWidgets).toEqual([]);
    expect(record.selection).toEqual(setup.state.selection.ranges);
    expect(record.sourceSha256After).toBe(record.sourceSha256);
    expect(record.productAcceptance).toBe(false);
  });

  it("refuses a matching filename outside an active isolated Vault", async () => {
    const setup = harness();
    setup.marker.state = "closed";
    await expect(setup.record()).rejects.toThrow("active Number Suite acceptance Vault");
    expect(setup.writes).toEqual([]);
  });

  it("refuses another product's active acceptance Vault", async () => {
    const setup = harness();
    setup.marker.pluginId = "other-product";
    await expect(setup.record()).rejects.toThrow("active Number Suite acceptance Vault");
    expect(setup.writes).toEqual([]);
  });

  it("refuses an unknown stage or an existing observation without overwriting it", async () => {
    const setup = harness();
    await expect(setup.record("arbitrary")).rejects.toThrow("Unknown note rendering stage");
    setup.app.vault.adapter.exists = async () => true;
    await expect(setup.record()).rejects.toThrow("already exists for this stage");
    expect(setup.writes).toEqual([]);
  });

  it("refuses any other note without reading its bytes", async () => {
    const setup = harness();
    setup.active.file.path = "Personal.md";
    setup.app.vault.readBinary = async () => { throw new Error("Unexpected file read"); };
    await expect(setup.record()).rejects.toThrow("Open Link metadata boundaries");
    expect(setup.writes).toEqual([]);
  });

  it("refuses altered source and unsaved editor content", async () => {
    const disk = harness();
    disk.app.vault.readBinary = async () => Buffer.from("Changed fixture");
    await expect(disk.record()).rejects.toThrow("fixture bytes differ");
    expect(disk.writes).toEqual([]);
    const editor = harness();
    editor.state.doc.toString = () => "Unsaved content";
    await expect(editor.record()).rejects.toThrow("editor differs");
    expect(editor.writes).toEqual([]);
  });

  it("refuses a fixture that changes during observation", async () => {
    const setup = harness();
    let reads = 0;
    setup.app.vault.readBinary = async () => ++reads === 1 ? fixture : Buffer.from("Concurrent edit");
    await expect(setup.record()).rejects.toThrow("changed during the read-only observation");
    expect(setup.writes).toEqual([]);
  });
});
