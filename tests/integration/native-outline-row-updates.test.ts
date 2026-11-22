// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeadingCache } from "obsidian";

vi.mock("obsidian", async (original) => ({
  ...await original<Record<string, unknown>>(),
  ItemView: class {
    readonly contentEl = document.createElement("div");
    readonly containerEl = document.createElement("div");
    getState() { return { file: "Note.md" }; }
  },
  getFrontMatterInfo: (source: string) => {
    const match = /^---\n([\s\S]*?)\n---\n/u.exec(source);
    return { exists: match != null, frontmatter: match?.[1] ?? "" };
  },
  parseYaml: (source: string) => ({
    "number-suite": source.includes("disabled=true") ? ["disabled=true"] : ["heading.virtual=true"],
  }),
}));
import { ItemView, MarkdownView, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import * as projectionModule from "../../src/integration/native-outline-projection";
import { NativeOutlineEnhancer } from "../../src/integration/native-outline";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe("native Outline row updates", () => {
  it.each(["prose", "prose-before-caption", "prose-before-heading", "disabled", "shifted-heading", "changed-heading"])("preserves native row ownership for %s", async (scenario) => {
    vi.useFakeTimers();
    Object.defineProperty(document, "win", { configurable: true, value: {
      createSpan: () => document.createElement("span"),
    } });
    let source = scenario === "disabled" ? "---\nnumber-suite: [disabled=true]\n---\n## Chapter\n" : "## Chapter\nA paragraph\n";
    if (scenario === "prose-before-caption") source += "\nFigure: Following";
    const heading = (line: number, offset: number): HeadingCache => ({
      heading: "Chapter", level: 2,
      position: { start: { line, col: 0, offset }, end: { line, col: 10, offset: offset + 10 } },
    });
    let cached = [heading(scenario === "disabled" ? 3 : 0, source.indexOf("##"))];
    if (scenario === "shifted-heading" || scenario === "changed-heading" || scenario === "prose-before-heading") {
      cached.push({ ...heading(2, source.length), heading: "Other" });
      source += "## Other";
    }
    let updateCount = 0;
    const view = new (ItemView as unknown as new () => ItemView)();
    document.body.append(view.contentEl);
    const innerEl = document.createElement("div");
    const secondRow = document.createElement("div");
    view.contentEl.append(innerEl, secondRow);
    Object.assign(view, {
      getHeadings: () => cached,
      update: () => {
        updateCount++;
        const headings = (view as unknown as { getHeadings(): HeadingCache[] }).getHeadings();
        Object.assign(view, { tree: { root: { vChildren: { _children: headings.map((item, index) => ({
          heading: item, innerEl: index === 0 ? innerEl : secondRow, vChildren: { _children: [] },
        })) } } } });
        innerEl.textContent = "Chapter";
        secondRow.textContent = "Other";
      },
    });
    const file = new (TFile as unknown as new (path: string) => TFile)("Note.md");
    const editor = { getValue: () => source };
    const markdown = Object.assign(Object.create(MarkdownView.prototype) as MarkdownView, {
      file, editor, getMode: () => "preview",
    });
    const sourceLeaf = { view: markdown, setEphemeralState: vi.fn() };
    type Listener = (...args: never[]) => void;
    const listeners = new Map<string, Listener>();
    const on = (event: string, listener: Listener) => { listeners.set(event, listener); return {}; };
    const plugin = {
      registerEvent: vi.fn(), register: vi.fn(),
      app: {
        workspace: { on, onLayoutReady: (callback: () => void) => callback(),
          iterateAllLeaves: (visit: (leaf: typeof sourceLeaf) => void) => visit(sourceLeaf), revealLeaf: vi.fn(),
          getLeavesOfType: (type: string) => type === "outline" ? [{ view }] : [sourceLeaf] },
        vault: { on, getAbstractFileByPath: () => file }, metadataCache: { on },
      },
    };
    const enhancer = new NativeOutlineEnhancer(plugin as never,
      () => ({ ...DEFAULT_SETTINGS, showVirtualNumbers: true }));
    enhancer.start();
    await vi.advanceTimersByTimeAsync(80);

    if (scenario === "disabled") {
      expect(innerEl.querySelector(".number-suite-native-outline-number")).toBeNull();
    } else if (scenario.startsWith("prose")) {
      expect(innerEl.querySelector(".is-virtual")?.textContent).toBe("1");
      const baseCount = updateCount;
      const planCalls = vi.spyOn(projectionModule, "createNativeOutlineProjection");
      const pluginReplacements = vi.spyOn(innerEl, "replaceChildren");
      const badgeInstances = new Set<Element>([innerEl.querySelector(".is-virtual")!]);
      for (let i = 0; i < 10; i++) {
        source = scenario === "prose" ? source + "x" : source.replace("paragraph", "paragraphx");
        (listeners.get("editor-change") as (...args: unknown[]) => void)(editor, { file });
        if (scenario === "prose-before-heading") {
          cached[1] = { ...heading(2, source.indexOf("## Other")), heading: "Other" };
          (listeners.get("changed") as (...args: unknown[]) => void)(file);
        }
        expect(innerEl.querySelector(".is-virtual")).toBe([...badgeInstances][0]);
        await vi.advanceTimersByTimeAsync(80);
        expect(innerEl.querySelector(".is-virtual")?.textContent).toBe("1");
        badgeInstances.add(innerEl.querySelector(".is-virtual")!);
      }
      expect(updateCount - baseCount).toBe(0);
      (listeners.get("changed") as (...args: unknown[]) => void)(file);
      await vi.advanceTimersByTimeAsync(80);
      badgeInstances.add(innerEl.querySelector(".is-virtual")!);
      expect(updateCount - baseCount).toBe(0);
      expect(planCalls).not.toHaveBeenCalled();
      expect(pluginReplacements).not.toHaveBeenCalled();
      expect(badgeInstances.size).toBe(1);
      // A host mutation in the same pane does not replace the first row's existing badge.
      view.contentEl.appendChild(document.createElement("div"));
      await vi.advanceTimersByTimeAsync(80);
      expect(innerEl.querySelector(".is-virtual")).toBe([...badgeInstances][0]);
      planCalls.mockRestore();
      pluginReplacements.mockRestore();
      (listeners.get("delete") as (...args: unknown[]) => void)(file);
      await vi.advanceTimersByTimeAsync(0);
      expect(innerEl.querySelector(".number-suite-native-outline-number")).toBeNull();
    } else {
      expect(innerEl.querySelector(".is-virtual")?.textContent).toBe("1");
      expect(secondRow.querySelector(".is-virtual")?.textContent).toBe("2");
      source = source.replace("A paragraph", "A paragraph\nAnother paragraph");
      if (scenario === "changed-heading") source = source.replace("## Other", "## New");
      (listeners.get("editor-change") as (...args: unknown[]) => void)(editor, { file });
      await vi.advanceTimersByTimeAsync(80);
      if (scenario === "shifted-heading") expect(innerEl.querySelector(".is-virtual")?.textContent).toBe("1");
    }
    if (scenario === "changed-heading") {
      const nativeClick = vi.fn();
      secondRow.addEventListener("click", nativeClick);
      secondRow.click();
      expect(nativeClick).not.toHaveBeenCalled();
      expect(sourceLeaf.setEphemeralState).not.toHaveBeenCalled();
      cached[1] = { ...heading(3, source.indexOf("## New")), heading: "New" };
      (listeners.get("changed") as (...args: unknown[]) => void)(file);
      await vi.advanceTimersByTimeAsync(0);
      secondRow.click();
      expect(nativeClick).toHaveBeenCalledOnce();
    }
    if (scenario === "shifted-heading") {
      expect(secondRow.querySelector(".is-virtual")?.textContent).toBe("2");
      const nativeClick = vi.fn();
      secondRow.addEventListener("click", nativeClick);
      secondRow.click();
      expect(nativeClick).not.toHaveBeenCalled();
      expect(sourceLeaf.setEphemeralState).toHaveBeenCalledExactlyOnceWith({ line: 3 });
      const hostHeadings = (view as unknown as { getHeadings(): HeadingCache[] }).getHeadings();
      expect(hostHeadings[1]?.position.start.line).toBe(3);
      expect(cached[1]?.position.start.line).toBe(2);
      cached[1] = { ...heading(3, source.indexOf("## Other")), heading: "Other" };
      (listeners.get("changed") as (...args: unknown[]) => void)(file);
      await vi.advanceTimersByTimeAsync(80);
      expect(innerEl.querySelector(".is-virtual")?.textContent).toBe("1");
      expect(secondRow.querySelector(".is-virtual")?.textContent).toBe("2");
    }
    enhancer.stop();
  });
});
