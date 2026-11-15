const { Plugin, Modal, Notice, MarkdownView } = require("obsidian");

const OBSERVATION_DIRECTORY = ".obsidian/plugins/number-suite-acceptance-provider/observations";
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_OBSERVATION_BYTES = 512 * 1024;
const NOTE_FIXTURE = "Link metadata boundaries.md";
const NOTE_FIXTURE_SHA256 = "7d35e228f047b6bbdc7f8324a20d8ce4a47f272536b6db3e4886d03cb92d9d83";
const NOTE_RENDERING_STAGES = ["initial", "reloaded", "caret", "mode-reset"];
const renderingIdentities = new WeakMap();
let nextRenderingIdentity = 1;

function renderingIdentity(value) {
  if (value == null || typeof value !== "object") return null;
  if (!renderingIdentities.has(value)) renderingIdentities.set(value, nextRenderingIdentity++);
  return renderingIdentities.get(value);
}

function shortText(value, limit = 256) {
  return String(value ?? "").slice(0, limit);
}

function rectangle(element) {
  const rect = element.getBoundingClientRect();
  return Object.fromEntries(["x", "y", "top", "right", "bottom", "left", "width", "height"]
    .map((key) => [key, Math.round(rect[key] * 100) / 100]));
}

function sectionInformation(section, preview) {
  for (const [name, provider] of [["preview", preview], ["renderer", preview?.renderer]]) {
    if (typeof provider?.getSectionInfo !== "function") continue;
    try {
      const info = provider.getSectionInfo(section);
      if (Number.isInteger(info?.lineStart) && Number.isInteger(info?.lineEnd)) {
        return { provider: name, lineStart: info.lineStart, lineEnd: info.lineEnd };
      }
    } catch {
      // Native sections may disappear during virtualization; absence is diagnostic data.
    }
  }
  return null;
}

function elementObservation(element, sections) {
  const section = element.closest(".markdown-preview-section > div");
  const style = element.ownerDocument.defaultView.getComputedStyle(element);
  return {
    tag: element.tagName.toLowerCase(),
    classes: shortText(element.className),
    text: shortText(element.textContent),
    sectionIndex: sections.indexOf(section),
    connected: element.isConnected,
    rectangle: rectangle(element),
    display: style.display,
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    contain: style.contain,
    visibility: style.visibility,
    translate: style.translate,
    captionKind: element.getAttribute("data-number-suite-caption-kind"),
    captionPlacement: element.getAttribute("data-number-suite-caption-placement"),
    captionObject: element.classList.contains("number-suite-caption-object"),
    captionAligned: element.classList.contains("number-suite-caption-object-aligned"),
    captionInlineOffset: element.style.getPropertyValue("--number-suite-caption-inline-offset"),
  };
}

async function sha256(bytes, view) {
  const digest = await view.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function recordRenderedObservation(app) {
  const active = app.workspace.getActiveViewOfType(MarkdownView);
  const file = active?.file;
  if (file == null || !/^Boundary [^/\\]+\.md$/u.test(file.path) || active.getMode() !== "preview") {
    new Notice("Open a Boundary fixture in Reading View before recording diagnostics");
    return;
  }
  if (file.stat.size > MAX_SOURCE_BYTES) throw new Error("Fixture exceeds the observation source limit");
  const preview = active.previewMode;
  const root = preview?.containerEl;
  if (root == null) throw new Error("The active Reading View has no rendered container");
  const win = root.ownerDocument.defaultView;
  if (win?.crypto?.subtle == null) throw new Error("SHA-256 is unavailable in this host");
  const before = await app.vault.readBinary(file);
  const sourceSha256 = await sha256(before, win);
  if (app.workspace.getActiveViewOfType(MarkdownView) !== active || active.file !== file) {
    throw new Error("The active fixture changed before observation");
  }
  const allSections = [...root.querySelectorAll(".markdown-preview-section > div")]
    .filter((element) => [...element.classList].some((name) => name.startsWith("el-")));
  const sections = allSections.slice(0, 128);
  const allElements = [...root.querySelectorAll("p, table, img, .math-block, .math-inline, mjx-container, pre, code")];
  const allAnchors = [...root.querySelectorAll("a.internal-link")];
  const observation = {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    sourcePath: file.path,
    sourceSha256,
    sourceByteLength: before.byteLength,
    mode: active.getMode(),
    viewport: { width: win.innerWidth, height: win.innerHeight, devicePixelRatio: win.devicePixelRatio },
    scope: "Currently mounted native Reading View DOM; offscreen sections may be virtualized",
    sections: sections.map((section) => ({
      ...elementObservation(section, sections),
      sourceRange: sectionInformation(section, preview),
      lineAttributes: Object.fromEntries(["data-line", "data-line-start", "data-line-end"]
        .map((name) => [name, section.getAttribute(name)])),
    })),
    elements: allElements.slice(0, 256).map((element) => elementObservation(element, sections)),
    references: allAnchors.slice(0, 256).map((anchor) => ({
      ...elementObservation(anchor, sections),
      href: shortText(anchor.getAttribute("href")),
      dataHref: shortText(anchor.getAttribute("data-href")),
      pill: anchor.classList.contains("number-suite-reference-pill"),
      reference: anchor.getAttribute("data-number-suite-reference"),
      targetLine: anchor.getAttribute("data-number-suite-reference-line"),
      targetKind: anchor.getAttribute("data-number-suite-reference-kind"),
    })),
    counts: { sections: allSections.length, elements: allElements.length, references: allAnchors.length },
    truncated: { sections: allSections.length > 128, elements: allElements.length > 256, references: allAnchors.length > 256 },
  };
  const after = await app.vault.readBinary(file);
  observation.sourceSha256After = await sha256(after, win);
  observation.sourceChangedDuringObservation = observation.sourceSha256After !== sourceSha256;
  if (app.workspace.getActiveViewOfType(MarkdownView) !== active || active.file !== file) {
    throw new Error("The active fixture changed during observation");
  }
  const output = JSON.stringify(observation, null, 2) + "\n";
  if (new TextEncoder().encode(output).byteLength > MAX_OBSERVATION_BYTES) {
    throw new Error("Rendered observation exceeds the output limit");
  }
  const adapter = app.vault.adapter;
  if (!await adapter.exists(OBSERVATION_DIRECTORY)) await adapter.mkdir(OBSERVATION_DIRECTORY);
  const timestamp = observation.observedAt.replace(/[:.]/gu, "-");
  const outputPath = `${OBSERVATION_DIRECTORY}/${file.basename}-${timestamp}.json`;
  if (await adapter.exists(outputPath)) throw new Error("An observation already exists for this timestamp");
  await adapter.write(outputPath, output);
  new Notice(`Recorded rendered diagnostics: ${file.basename}`);
}

function decorationObservation(set, from, to) {
  if (typeof set?.between !== "function") return null;
  const ranges = [];
  let total = 0;
  set.between(from, to, (start, end, value) => {
    total++;
    if (ranges.length >= 128) return;
    const widget = value.spec?.widget ?? value.widget;
    ranges.push({
      from: start, to: end,
      startSide: value.startSide, endSide: value.endSide,
      point: value.point, block: value.spec?.block ?? value.block ?? false,
      widget: widget == null ? null : {
        constructor: shortText(widget.constructor?.name),
        kind: typeof widget.kind === "string" ? shortText(widget.kind) : null,
        label: typeof widget.label === "string" ? shortText(widget.label) : null,
      },
      class: shortText(value.spec?.class ?? value.spec?.attributes?.class),
      tagName: shortText(value.spec?.tagName),
      inclusive: value.spec?.inclusive ?? null,
    });
  });
  return { total, truncated: total > ranges.length, ranges };
}

// Diagnostic-only access to the host's already-computed editor state. Never call
// decoration providers, dispatch a transaction, refresh the product, or invoke toDOM.
async function recordNoteRendering(app, stage) {
  if (!NOTE_RENDERING_STAGES.includes(stage)) throw new Error("Unknown note rendering stage");
  const adapter = app.vault.adapter;
  const markerPath = ".obsidian-acceptance/marker.json";
  if (!await adapter.exists(markerPath)) throw new Error("An isolated acceptance marker is required");
  const marker = JSON.parse(await adapter.read(markerPath));
  if (marker?.kind !== "obsidian-plugin-acceptance-vault" || marker.schemaVersion !== 3 || marker.pluginId !== "number-suite"
    || !["host-open", "runtime-ready"].includes(marker.state)
    || !marker.runtimeReadiness?.expectedPlugins?.some((plugin) => plugin.id === "number-suite")) {
    throw new Error("An active Number Suite acceptance Vault is required");
  }
  const active = app.workspace.getActiveViewOfType(MarkdownView);
  const file = active?.file;
  if (file?.path !== NOTE_FIXTURE || active.getMode() !== "source") {
    throw new Error("Open Link metadata boundaries in Live Preview or Source mode");
  }
  const { EditorView } = require("@codemirror/view");
  const { editorLivePreviewField } = require("obsidian");
  const editorElement = active.contentEl.querySelector(".cm-editor");
  const cm = editorElement == null ? null : EditorView.findFromDOM(editorElement);
  if (cm?.state == null) throw new Error("The current fixture has no CodeMirror view");
  const win = cm.dom.ownerDocument.defaultView;
  const before = await app.vault.readBinary(file);
  if (before.byteLength > MAX_SOURCE_BYTES || await sha256(before, win) !== NOTE_FIXTURE_SHA256) {
    throw new Error("The diagnostic fixture bytes differ from the checked-in synthetic input");
  }
  const source = cm.state.doc.toString();
  if (await sha256(new TextEncoder().encode(source), win) !== NOTE_FIXTURE_SHA256) {
    throw new Error("The editor differs from the checked-in synthetic input");
  }
  // Finish asynchronous identity checks before taking one synchronous snapshot.
  // Palette dismissal and background parsing may legitimately replace EditorState.
  const state = cm.state;
  if (state.doc.toString() !== source) throw new Error("The editor changed before observation");
  const sets = Array.isArray(cm.docView?.decorations) ? cm.docView.decorations : [];
  const plugins = Array.isArray(cm.plugins) ? cm.plugins : [];
  const noteFrom = source.indexOf("[^ghost]:");
  const facets = state.facet(EditorView.decorations);
  const nodes = [...cm.contentDOM.querySelectorAll(".number-suite-note-reference, .number-suite-note-definition")];
  const lines = [...cm.contentDOM.querySelectorAll(".cm-line")];
  const product = app.plugins?.getPlugin?.("number-suite");
  const observation = {
    schemaVersion: 1, kind: "number-suite/note-rendering-diagnostic-v1",
    observedAt: new Date().toISOString(), stage, runId: marker.runId,
    candidateIdentityHash: marker.candidateIdentityHash,
    sourcePath: file.path, sourceSha256: NOTE_FIXTURE_SHA256,
    sourceByteLength: before.byteLength, editorLength: source.length,
    viewIdentity: renderingIdentity(cm), documentIdentity: renderingIdentity(state.doc),
    mode: active.getMode(), livePreview: state.field(editorLivePreviewField, false) ?? null,
    selection: state.selection.ranges.map(({ from, to }) => ({ from, to })),
    composing: cm.composing, hasFocus: cm.hasFocus,
    product: { loaded: product != null, version: product?.manifest?.version ?? null,
      showNoteNumbers: product?.settings?.showNoteNumbers ?? null,
      noteDisplayMode: product?.settings?.noteDisplayMode ?? null,
      enableLivePreview: product?.settings?.enableLivePreview ?? null },
    // Order is material: overlapping replacement sets can hide each other.
    renderedSets: sets.slice(0, 128).map((set, index) => ({
      index, dynamic: cm.docView?.dynamicDecorationMap?.[index] ?? null,
      definitions: decorationObservation(set, noteFrom, source.length),
    })),
    facets: facets.slice(0, 128).map((facet, index) => ({
      index, kind: typeof facet, name: typeof facet === "function" ? shortText(facet.name) : null,
      renderedSetIndex: sets.indexOf(facet),
      definitions: typeof facet === "function" ? null : decorationObservation(facet, noteFrom, source.length),
    })),
    plugins: plugins.slice(0, 128).map((plugin, index) => ({
      index, id: plugin.spec?.plugin?.id ?? plugin.plugin?.id ?? null,
      constructor: shortText(plugin.value?.constructor?.name),
      pendingUpdate: plugin.mustUpdate != null,
      renderedSetIndex: sets.indexOf(plugin.value?.decorations),
      definitionSetIndex: sets.indexOf(plugin.value?.definitionDecorations),
      definitions: decorationObservation(plugin.value?.definitionDecorations, noteFrom, source.length),
      // Include references as well: a native superscript is not proof that the
      // product's reference widget and definition widgets share the same plan.
      decorations: decorationObservation(plugin.value?.decorations, 0, source.length),
    })),
    dom: {
      noteWidgets: nodes.slice(0, 64).map((node) => ({
        classes: shortText(node.className), text: shortText(node.textContent),
        html: shortText(node.outerHTML, 2048), rectangle: rectangle(node),
      })),
      lines: lines.slice(0, 64).map((line) => {
        let from = null;
        try { from = cm.posAtDOM(line); } catch { /* Detached native line. */ }
        return { from, text: shortText(line.textContent, 1024), html: shortText(line.outerHTML, 4096) };
      }),
    },
    counts: { renderedSets: sets.length, facets: facets.length, plugins: plugins.length,
      noteWidgets: nodes.length, lines: lines.length },
    productAcceptance: false,
  };
  if (cm.state !== state) throw new Error("The editor state changed during synchronous collection");
  const after = await app.vault.readBinary(file);
  observation.sourceSha256After = await sha256(after, win);
  const afterState = cm.state;
  observation.stateChangedAfterCapture = afterState !== state;
  observation.documentIdentityAfter = renderingIdentity(afterState.doc);
  observation.selectionAfter = afterState.selection.ranges.map(({ from, to }) => ({ from, to }));
  observation.livePreviewAfter = afterState.field(editorLivePreviewField, false) ?? null;
  if (observation.sourceSha256After !== NOTE_FIXTURE_SHA256 || afterState.doc !== state.doc
    || app.workspace.getActiveViewOfType(MarkdownView) !== active || active.file !== file) {
    throw new Error("The fixture or editor document changed during the read-only observation");
  }
  const output = JSON.stringify(observation, null, 2) + "\n";
  if (new TextEncoder().encode(output).byteLength > MAX_OBSERVATION_BYTES) {
    throw new Error("Note rendering observation exceeds the output limit");
  }
  const outputPath = `number-suite-note-rendering-${stage}.json`;
  if (await adapter.exists(outputPath)) throw new Error("An observation already exists for this stage");
  await adapter.write(outputPath, output);
  new Notice(`Recorded read-only diagnostics: ${outputPath}`);
}

module.exports = class extends Plugin {
  onload() {
    for (const stage of NOTE_RENDERING_STAGES) {
      this.addCommand({
        id: `record-note-rendering-${stage}`,
        name: `Record note rendering: ${stage}`,
        callback: async () => {
          try {
            await recordNoteRendering(this.app, stage);
          } catch (error) {
            new Notice(`Note rendering diagnostics unavailable: ${shortText(error?.message ?? error)}`);
          }
        },
      });
    }
    // Explicit synthetic input preparation only; no product actions or verdicts.
    this.addCommand({
      id: "prepare-audit-roman-range-and-recovery",
      name: "Prepare audit Roman boundaries",
      callback: async () => {
        const folder = "Audit Roman";
        try {
          if (await this.app.vault.adapter.exists(folder)) {
            new Notice(`Audit fixture folder already exists: ${folder}. Use a fresh disposable Vault.`);
            return;
          }
          const fixtures = {
            "Audit Roman valid.md": [
              "---",
              "number-suite:",
              "  - heading.virtual=true",
              "  - heading.scheme=chinese-traditional-chapters",
              "  - heading.first-number.h7=3999",
              "---",
              "",
              "####### Valid Roman boundary",
              "",
              "Keep this body unchanged through writing and cleanup.",
              "",
            ].join("\n"),
            "Audit Roman range.md": [
              "---",
              "number-suite:",
              "  - heading.virtual=true",
              "  - heading.scheme=chinese-traditional-chapters",
              "  - heading.first-number.h7=3999",
              "---",
              "",
              "# Whole-note refusal control",
              "",
              "####### Last valid Roman",
              "",
              "####### First invalid Roman",
              "",
              "The entire note must remain unchanged when its numbering plan is refused.",
              "",
            ].join("\n"),
          };
          await this.app.vault.createFolder(folder);
          for (const [name, content] of Object.entries(fixtures)) {
            await this.app.vault.create(`${folder}/${name}`, content);
          }
          new Notice(`Prepared synthetic audit inputs in ${folder}; inspect them through the product UI.`);
        } catch (error) {
          new Notice(`Audit fixture preparation failed: ${String(error)}`);
        }
      },
    });
    this.addCommand({
      id: "record-rendered-observation",
      name: "Record current Boundary fixture rendered diagnostics",
      callback: async () => {
        try {
          await recordRenderedObservation(this.app);
        } catch (error) {
          new Notice(`Rendered diagnostics unavailable: ${shortText(error?.message ?? error)}`);
        }
      },
    });
    this.addCommand({
      id: "conflict-next-note-save",
      name: "Simulate concurrent H1 change on next note save",
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (file?.path !== "Controls.md") {
          new Notice("Open Controls before arming the conflict fixture");
          return;
        }
        this.restoreNoteSave?.();
        const manager = this.app.fileManager;
        const original = manager.processFrontMatter;
        const restore = () => {
          if (manager.processFrontMatter === wrapped) manager.processFrontMatter = original;
          this.restoreNoteSave = null;
        };
        const wrapped = async function (target, callback, ...args) {
          if (target !== file) return original.call(this, target, callback, ...args);
          restore();
          await original.call(this, target, (values) => {
            const entries = Array.isArray(values["number-suite"]) ? values["number-suite"] : [];
            values["number-suite"] = [
              ...entries.filter((value) => !String(value).startsWith("heading.first-number.h1=")),
              "heading.first-number.h1=7",
            ];
          });
          return original.call(this, target, callback, ...args);
        };
        manager.processFrontMatter = wrapped;
        this.restoreNoteSave = restore;
        new Notice("The next Controls save will encounter a concurrent H1 value of 7");
      },
    });
    this.addCommand({
      id: "delay-next-preview",
      name: "Delay next preview apply for 20 seconds",
      callback: () => {
        this.restore?.();
        const original = Modal.prototype.open;
        const restore = () => {
          if (Modal.prototype.open === wrapped) Modal.prototype.open = original;
          this.restore = null;
        };
        const wrapped = function (...args) {
          const options = this.options;
          if (Array.isArray(options?.documents) && typeof options.onConfirm === "function") {
            restore();
            const confirm = options.onConfirm;
            options.onConfirm = async (...confirmArgs) => {
              await new Promise((resolve) => setTimeout(resolve, 20000));
              return confirm(...confirmArgs);
            };
          }
          return original.apply(this, args);
        };
        this.restore = restore;
        Modal.prototype.open = wrapped;
        new Notice("Next preview apply will wait 20 seconds (acceptance fixture)");
      },
    });
  }

  onunload() {
    this.restore?.();
    this.restoreNoteSave?.();
  }
};
