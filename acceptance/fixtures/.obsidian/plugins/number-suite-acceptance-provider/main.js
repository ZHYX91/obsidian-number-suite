const { Plugin, Modal, Notice, MarkdownView } = require("obsidian");

const OBSERVATION_DIRECTORY = ".obsidian/plugins/number-suite-acceptance-provider/observations";
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_OBSERVATION_BYTES = 512 * 1024;

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

module.exports = class extends Plugin {
  onload() {
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
