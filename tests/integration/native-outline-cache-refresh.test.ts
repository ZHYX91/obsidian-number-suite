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
    "number-suite": ["heading.virtual=" + String(!source.includes("false"))],
  }),
}));
import { ItemView, MarkdownView, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { NativeOutlineEnhancer } from "../../src/integration/native-outline";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe("native Outline metadata catch-up", () => {
  it.each([true, false])("reprojects after removing the %s override without switching notes", async (override) => {
    vi.useFakeTimers();
    Object.defineProperty(document, "win", { configurable: true, value: {
      createSpan: () => document.createElement("span"),
    } });
    let source = `---\nnumber-suite: [heading.virtual=${String(override)}]\n---\n## Chapter\n`;
    const heading = (line: number, offset: number): HeadingCache => ({
      heading: "Chapter", level: 2,
      position: { start: { line, col: 0, offset }, end: { line, col: 10, offset: offset + 10 } },
    });
    let cached = [heading(3, source.indexOf("##"))];
    const view = new (ItemView as unknown as new () => ItemView)();
    document.body.append(view.contentEl);
    const innerEl = document.createElement("div");
    view.contentEl.append(innerEl);
    Object.assign(view, {
      getHeadings: () => cached,
      update: () => {
        const headings = (view as unknown as { getHeadings(): HeadingCache[] }).getHeadings();
        Object.assign(view, { tree: { root: { vChildren: { _children: headings.map((item) => ({
          heading: item, innerEl, vChildren: { _children: [] },
        })) } } } });
        innerEl.textContent = "Chapter";
      },
    });
    const file = new (TFile as unknown as new (path: string) => TFile)("Note.md");
    const editor = { getValue: () => source };
    const markdown = Object.assign(Object.create(MarkdownView.prototype) as MarkdownView, { file, editor });
    type Listener = (...args: never[]) => void;
    const listeners = new Map<string, Listener>();
    const on = (event: string, listener: Listener) => { listeners.set(event, listener); return {}; };
    const plugin = {
      registerEvent: vi.fn(), register: vi.fn(),
      app: {
        workspace: { on, onLayoutReady: (callback: () => void) => callback(),
          getLeavesOfType: (type: string) => [{ view: type === "outline" ? view : markdown }] },
        vault: { on, getAbstractFileByPath: () => file }, metadataCache: { on },
      },
    };
    const enhancer = new NativeOutlineEnhancer(plugin as never,
      () => ({ ...DEFAULT_SETTINGS, showVirtualNumbers: true }));
    enhancer.start();
    await vi.advanceTimersByTimeAsync(80);
    expect(innerEl.querySelector(".number-suite-native-outline-number:not(.number-suite-native-outline-level)") != null).toBe(override);

    if (!override) expect(innerEl.querySelector(".number-suite-native-outline-level")?.textContent).toBe("H2");

    source = "## Chapter\n";
    (listeners.get("editor-change") as (...args: unknown[]) => void)(editor, { file });
    await vi.advanceTimersByTimeAsync(80);
    expect(innerEl.querySelector(".number-suite-native-outline-number")).toBeNull();

    cached = [heading(0, 0)];
    (listeners.get("changed") as (...args: unknown[]) => void)(file);
    await vi.advanceTimersByTimeAsync(80);
    expect(innerEl.querySelector(".number-suite-native-outline-number")?.textContent).toBe("1");
    enhancer.stop();
  });

  it("reads only bound notes and forgets closed, renamed, deleted and disabled paths", async () => {
    let enabled = false;
    const paths = ["A.md", "B.md", "Other.md"];
    const files = paths.map((path) => new (TFile as unknown as new (path: string) => TFile)(path));
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const on = (name: string, callback: (...args: unknown[]) => void) => { listeners.set(name, callback); };
    const emit = (name: string, ...args: unknown[]) => listeners.get(name)?.(...args);
    const outline = (file: TFile) => Object.assign(new (ItemView as unknown as new () => ItemView)(), {
      getState: () => ({ file: file.path }), getHeadings: () => [] as HeadingCache[],
    });
    let views = [outline(files[0]!)];
    // Delay the original read past a close/reopen of the same file.
    let finishOldRead: (value: string) => void = () => {};
    const read = vi.fn((file: TFile): Promise<string> => Promise.resolve("####### " + file.path));
    const plugin = {
      registerEvent: vi.fn(), register: vi.fn(),
      app: {
        workspace: { on, onLayoutReady: (callback: () => void) => callback(),
          getLeavesOfType: (type: string) => type === "outline" ? views.map((view) => ({ view })) : [] },
        vault: { on, cachedRead: read, getAbstractFileByPath: (path: string) => files.find((f) => f.path === path) },
        metadataCache: { on },
      },
    };
    const enhancer = new NativeOutlineEnhancer(plugin as never, () => ({ ...DEFAULT_SETTINGS, enhanceNativeOutline: enabled }));
    enhancer.start();
    for (const file of files) { emit("modify", file); emit("changed", file); }
    const getValue = vi.fn(() => "####### Untouched");
    emit("editor-change", { getValue }, { file: files[2] });
    expect(read).not.toHaveBeenCalled();
    expect(getValue).not.toHaveBeenCalled();

    enabled = true;
    read.mockImplementationOnce(() => new Promise((resolve) => { finishOldRead = resolve; }));
    enhancer.refresh();
    expect(read).toHaveBeenCalledExactlyOnceWith(files[0]);
    views = [];
    emit("layout-change");
    emit("changed", files[0]);
    expect(read).toHaveBeenCalledTimes(1);

    views = [outline(files[0]!), outline(files[0]!)];
    emit("layout-change");
    await Promise.resolve();
    finishOldRead("####### Stale");
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(2);
    expect(views[0]!.getHeadings().map((h) => h.heading)).toEqual(["A.md"]);
    const detached = views.shift()!;
    const retained = detached.getHeadings;
    // Another plugin can wrap the Number Suite method and keep calling it after detachment.
    detached.getHeadings = () => retained();
    emit("layout-change");
    expect(detached.getHeadings()).toEqual([]);
    expect(views[0]!.getHeadings().map((h) => h.heading)).toEqual(["A.md"]);
    emit("delete", files[0]);
    expect(views[0]!.getHeadings()).toEqual([]);

    views = [outline(files[1]!)];
    emit("rename", files[1], "A.md");
    await Promise.resolve();
    emit("changed", files[0]);
    emit("modify", files[2]);
    expect(read).toHaveBeenCalledTimes(4);
    expect(views[0]!.getHeadings().map((h) => h.heading)).toEqual(["B.md"]);
    enabled = false;
    enhancer.refresh();
    emit("changed", files[1]);
    expect(read).toHaveBeenCalledTimes(4);
    expect(views[0]!.getHeadings()).toEqual([]);
    enhancer.stop();
  });

  it.each(["\r\n", "p\r\n".repeat(12) + "q\n"])(
    "reads and navigates external headings with physical line endings %j", async (prefix) => {
    Object.defineProperty(document, "win", { configurable: true, value: {
      createSpan: () => document.createElement("span"),
    } });
    const path = "file:C:/External/Note.md";
    const makeFile = (name: string) => new (TFile as unknown as new (path: string) => TFile)(name);
    const file = makeFile(path);
    const markdownLeaf = (file: TFile, initial: string) => {
      let data = initial;
      const editor = { getValue: () => data, transaction: vi.fn() };
      const leaf = { view: {} as MarkdownView, setEphemeralState: vi.fn(), openFile: vi.fn() };
      leaf.view = Object.assign(Object.create(MarkdownView.prototype) as MarkdownView, {
        leaf, file, editor, getState: () => ({ file: file.path }), getViewData: () => data,
        getMode: () => "preview",
      });
      return { leaf, editor, setData: (value: string) => { data = value; } };
    };
    // The source editor normalizes CRLF while the native cache indexes the file's raw offsets.
    const content = (title: string) => prefix.replace(/\r\n/gu, "\n") + "# Chapter\n####### " + title + "\n";
    const line = prefix.split("\n").length - 1;
    const own = markdownLeaf(file, content("External inside"));
    const sameName = markdownLeaf(makeFile("Note.md"), content("Vault inside"));
    const otherExternal = markdownLeaf(makeFile("file:C:/Other/Note.md"), content("Other inside"));
    const split = markdownLeaf(file, content("Split inside"));
    let open = [sameName.leaf, otherExternal.leaf, own.leaf];
    let active = sameName.leaf;
    let cacheOffset = prefix.length + 100;
    const view = Object.assign(new (ItemView as unknown as new () => ItemView)(), {
      getState: () => ({ file: path }),
      getHeadings: (): HeadingCache[] => [{
        heading: "Chapter", level: 1,
        position: { start: { line, col: 0, offset: cacheOffset }, end: { line, col: 9, offset: cacheOffset + 9 } },
      }],
      update: () => {
        const children = view.getHeadings().map((heading) => {
          const innerEl = document.createElement("div");
          innerEl.className = "tree-item-self";
          innerEl.textContent = heading.heading;
          return { heading, innerEl, vChildren: { _children: [] } };
        });
        Object.assign(view, { tree: { root: { vChildren: { _children: children } } } });
        view.contentEl.replaceChildren(...children.map((item) => item.innerEl));
      },
    });
    document.body.append(view.contentEl);
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const on = (name: string, callback: (...args: unknown[]) => void) => { listeners.set(name, callback); };
    const emit = (name: string, ...args: unknown[]) => listeners.get(name)?.(...args);
    const revealLeaf = vi.fn();
    const getLeaf = vi.fn();
    const lookup = vi.fn(() => null);
    const read = vi.fn();
    const plugin = {
      registerEvent: vi.fn(), register: vi.fn(),
      app: {
        workspace: { on, onLayoutReady: (callback: () => void) => callback(), revealLeaf, getLeaf,
          getLeavesOfType: (type: string) => type === "outline" ? [{ view }] : open,
          getActiveViewOfType: () => active.view, getMostRecentLeaf: () => active,
          iterateAllLeaves: (visit: (leaf: typeof active) => void) => open.forEach(visit) },
        vault: { on, cachedRead: read, getAbstractFileByPath: lookup }, metadataCache: { on },
      },
    };
    const enhancer = new NativeOutlineEnhancer(plugin as never, () => ({
      ...DEFAULT_SETTINGS, selectedSchemeId: "hierarchical", showVirtualNumbers: true, showOutlineExtendedHeadings: true,
    }));
    const labels = () => view.getHeadings().map((heading) => heading.heading);

    enhancer.start();
    await Promise.resolve();
    expect(labels()).toEqual(["Chapter"]);
    cacheOffset = prefix.length;
    emit("active-leaf-change", own.leaf);
    await Promise.resolve();
    expect(labels()).toEqual(["Chapter", "External inside"]);
    expect(view.contentEl.querySelector(".number-suite-native-outline-number")?.textContent).toBe("1");
    view.contentEl.lastElementChild!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(own.leaf.setEphemeralState).toHaveBeenCalledExactlyOnceWith({ line: line + 1 });
    expect(revealLeaf).toHaveBeenCalledExactlyOnceWith(own.leaf);
    expect(sameName.leaf.setEphemeralState).not.toHaveBeenCalled();
    expect(otherExternal.leaf.setEphemeralState).not.toHaveBeenCalled();

    open.push(split.leaf);
    active = split.leaf;
    emit("active-leaf-change", active);
    expect(labels()).toEqual(["Chapter", "Split inside"]);
    own.setData(content("Inactive edit"));
    emit("editor-change", own.editor, { file });
    expect(labels()).toEqual(["Chapter", "Split inside"]);
    split.setData(content("Unsaved edit"));
    emit("editor-change", split.editor, { file });
    expect(labels()).toEqual(["Chapter", "Unsaved edit"]);
    const current = view.contentEl.lastElementChild!;
    expect(current.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true, cancelable: true, isPrimary: true, pointerType: "mouse",
    }))).toBe(true);

    open = [sameName.leaf, otherExternal.leaf];
    active = otherExternal.leaf;
    current.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    emit("layout-change");
    expect(labels()).toEqual(["Chapter"]);
    expect(getLeaf).not.toHaveBeenCalled();
    expect(own.leaf.openFile).not.toHaveBeenCalled();
    expect(split.leaf.setEphemeralState).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    enhancer.stop();
  });
});
