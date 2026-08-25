import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarkdownView, Notice, TFile, type App } from "obsidian";

import { BatchController, type BatchPersistence } from "../../src/commands/batch";
import { DEFAULT_SETTINGS, type LastBatchSnapshot } from "../../src/config/settings";
import { digestText } from "../../src/core/text-digest";
import type { PreviewDocument } from "../../src/ui/preview-modal";

async function snapshot(contents: Readonly<Record<string, string>>): Promise<LastBatchSnapshot> {
  return {
    createdAt: "2026-08-08T00:00:00.000Z",
    operation: "write",
    status: "applied",
    files: await Promise.all(Object.entries(contents).map(async ([path, after]) => ({
      path,
      before: `before:${path}`,
      afterHash: await digestText(after),
    }))),
  };
}

function harness(
  initial: Readonly<Record<string, string>>,
  initialSnapshot: LastBatchSnapshot | null = null,
) {
  const contents = new Map(Object.entries(initial));
  const FileConstructor = TFile as unknown as new (path: string) => TFile;
  const files = new Map([...contents.keys()].map((path) => [path, new FileConstructor(path)]));
  let stored: LastBatchSnapshot | null = initialSnapshot;
  let processHook: ((path: string, call: number) => void | Promise<void>) | null = null;
  let processAfterHook: ((path: string, call: number) => void | Promise<void>) | null = null;
  let persistenceHook: ((next: LastBatchSnapshot | null, call: number) => void | Promise<void>) | null = null;
  let processCalls = 0;
  let persistenceCalls = 0;
  const persistedSnapshots: Array<LastBatchSnapshot | null> = [];
  const leaves: Array<{ view: MarkdownView }> = [];
  const vault = {
    getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    cachedRead: async (file: TFile) => contents.get(file.path) ?? "",
    process: async (file: TFile, transform: (current: string) => string) => {
      processCalls += 1;
      await processHook?.(file.path, processCalls);
      const current = contents.get(file.path);
      if (current == null) throw new Error(`Missing ${file.path}`);
      const next = transform(current);
      contents.set(file.path, next);
      await processAfterHook?.(file.path, processCalls);
      return next;
    },
  };
  const app = {
    vault,
    workspace: {
      iterateAllLeaves: (callback: (leaf: { view: MarkdownView }) => void) => leaves.forEach(callback),
    },
  } as unknown as App;
  const persistence: BatchPersistence = {
    getLastBatch: () => stored,
    setLastBatch: async (next) => {
      persistenceCalls += 1;
      stored = next;
      persistedSnapshots.push(next);
      await persistenceHook?.(next, persistenceCalls);
    },
  };
  return {
    contents,
    controller: new BatchController(app, () => DEFAULT_SETTINGS, persistence),
    addView: (path: string, initialValue: string) => {
      const view = new MarkdownView({} as never);
      view.file = files.get(path) ?? null;
      let buffer = initialValue;
      const save = vi.fn(async () => {
        const currentPath = view.file?.path;
        if (currentPath != null) contents.set(currentPath, buffer);
      });
      Object.assign(view, { editor: { getValue: () => buffer }, save });
      leaves.push({ view });
      return { view, save, setBuffer: (next: string) => { buffer = next; } };
    },
    getFile: (path: string) => files.get(path) ?? null,
    getStored: () => stored,
    persistedSnapshots,
    processCalls: () => processCalls,
    renameFile: (path: string, nextPath: string) => {
      const file = files.get(path);
      if (file == null) throw new Error(`Missing ${path}`);
      const content = contents.get(path);
      files.delete(path);
      contents.delete(path);
      file.path = nextPath;
      files.set(nextPath, file);
      if (content != null) contents.set(nextPath, content);
    },
    replaceFile: (path: string) => {
      const replacement = new FileConstructor(path);
      files.set(path, replacement);
      return replacement;
    },
    setPersistenceHook: (hook: typeof persistenceHook) => { persistenceHook = hook; },
    setProcessHook: (hook: typeof processHook) => { processHook = hook; },
    setProcessAfterHook: (hook: typeof processAfterHook) => { processAfterHook = hook; },
  };
}

function applyHarness(diskSource: string, bufferSource: string) {
  const contents = new Map([["a.md", diskSource]]);
  const FileConstructor = TFile as unknown as new (path: string) => TFile;
  const file = new FileConstructor("a.md");
  const view = new MarkdownView({} as never);
  view.file = file;
  const leaves: Array<{ view: MarkdownView }> = [{ view }];
  let afterSave: (() => void) | null = null;
  const save = vi.fn(async () => {
    contents.set(file.path, bufferSource);
    afterSave?.();
  });
  Object.assign(view, {
    editor: { getValue: () => bufferSource },
    save,
  });
  let stored: LastBatchSnapshot | null = null;
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => path === file.path ? file : null,
      cachedRead: async (target: TFile) => contents.get(target.path) ?? "",
      process: async (target: TFile, transform: (current: string) => string) => {
        const current = contents.get(target.path) ?? "";
        const next = transform(current);
        contents.set(target.path, next);
        return next;
      },
    },
    workspace: {
      iterateAllLeaves: (callback: (leaf: { view: MarkdownView }) => void) => {
        leaves.forEach(callback);
      },
    },
  } as unknown as App;
  const persistence: BatchPersistence = {
    getLastBatch: () => stored,
    setLastBatch: async (next) => { stored = next; },
  };
  return {
    contents,
    controller: new BatchController(app, () => DEFAULT_SETTINGS, persistence),
    getStored: () => stored,
    file,
    leaves,
    save,
    setAfterSave: (hook: typeof afterSave) => { afterSave = hook; },
    view,
  };
}

function previewDocument(source: string, result: string, path = "a.md"): PreviewDocument {
  return {
    path,
    plan: { operation: "write", source, result, changes: [], warnings: [] },
  };
}

async function applyPreview(controller: BatchController, document: PreviewDocument): Promise<void> {
  const apply = Reflect.get(controller, "apply") as (
    documents: readonly PreviewDocument[],
    operation: "write",
    translate: (key: string) => string,
  ) => Promise<void>;
  await apply.call(controller, [document], "write", (key) => key);
}

async function applyPreviews(
  controller: BatchController,
  documents: readonly PreviewDocument[],
): Promise<void> {
  const apply = Reflect.get(controller, "apply") as (
    nextDocuments: readonly PreviewDocument[],
    operation: "write",
    translate: (key: string) => string,
  ) => Promise<void>;
  await apply.call(controller, documents, "write", (key) => key);
}

beforeEach(() => {
  (Notice as unknown as { readonly messages: string[] }).messages.length = 0;
});

describe("BatchController undo", () => {
  it("restores an applied batch and clears its recovery snapshot", async () => {
    const applied = { "a.md": "after-a", "b.md": "after-b" };
    const recovery = await snapshot(applied);
    const test = harness(applied, recovery);

    await test.controller.undo((key) => key);

    expect(test.contents.get("a.md")).toBe("before:a.md");
    expect(test.contents.get("b.md")).toBe("before:b.md");
    expect(test.getStored()).toBeNull();
  });

  it("preserves a concurrent edit and retains recovery when a rollback conflicts", async () => {
    const applied = { "a.md": "after-a", "b.md": "after-b" };
    const recovery = await snapshot(applied);
    const test = harness(applied, recovery);
    test.setProcessHook((path, call) => {
      if (path === "b.md" && call === 2) {
        test.contents.set("a.md", "user-edit");
        throw new Error("injected failure");
      }
    });

    await test.controller.undo((key) => key);

    expect(test.contents.get("a.md")).toBe("user-edit");
    expect(test.contents.get("b.md")).toBe("after-b");
    expect(test.getStored()).toBe(recovery);
  });

  it("aborts when an open editor cannot be synchronized and leaves disk and recovery untouched", async () => {
    const recovery = await snapshot({ "a.md": "after-a" });
    const test = harness({ "a.md": "after-a" }, recovery);
    const open = test.addView("a.md", "unsaved edit");

    await test.controller.undo((key) => key);

    expect(test.contents.get("a.md")).toBe("after-a");
    expect(open.save).not.toHaveBeenCalled();
    expect(test.getStored()).toBe(recovery);
    expect((Notice as unknown as { readonly messages: string[] }).messages)
      .toContain("notice.undoConflict");
  });
});

describe("BatchController apply", () => {
  it("rejects a preview when an open editor buffer changed before confirmation", async () => {
    const test = applyHarness("before", "unsaved edit");

    await applyPreview(test.controller, previewDocument("before", "after"));

    expect(test.contents.get("a.md")).toBe("before");
    expect(test.save).not.toHaveBeenCalled();
    expect(test.getStored()).toBeNull();
    expect((Notice as unknown as { readonly messages: string[] }).messages).toContain("notice.batchChanged");
  });

  it("saves an unchanged bound editor buffer before guarded replacement", async () => {
    const test = applyHarness("before", "before");

    await applyPreview(test.controller, previewDocument("before", "after"));

    expect(test.save).toHaveBeenCalledOnce();
    expect(test.contents.get("a.md")).toBe("after");
    expect(test.getStored()?.status).toBe("applied");
  });

  it("rejects the preview when its bound view closes during save", async () => {
    const test = applyHarness("before", "before");
    test.setAfterSave(() => test.leaves.splice(0));

    await applyPreview(test.controller, previewDocument("before", "after"));

    expect(test.contents.get("a.md")).toBe("before");
    expect(test.getStored()).toBeNull();
    expect((Notice as unknown as { readonly messages: string[] }).messages)
      .toContain("notice.batchChanged");
  });

  it("rejects the preview when its bound view changes files during save", async () => {
    const test = applyHarness("before", "before");
    const FileConstructor = TFile as unknown as new (path: string) => TFile;
    test.setAfterSave(() => { test.view.file = new FileConstructor("other.md"); });

    await applyPreview(test.controller, previewDocument("before", "after"));

    expect(test.contents.get("a.md")).toBe("before");
    expect(test.getStored()).toBeNull();
    expect((Notice as unknown as { readonly messages: string[] }).messages)
      .toContain("notice.batchChanged");
  });

  it("rejects a new stale view of the same file opened during save", async () => {
    const test = applyHarness("before", "before");
    test.setAfterSave(() => {
      const lateView = new MarkdownView({} as never);
      lateView.file = test.file;
      Object.assign(lateView, {
        editor: { getValue: () => "late unsaved edit" },
        save: vi.fn(),
      });
      test.leaves.push({ view: lateView });
    });

    await applyPreview(test.controller, previewDocument("before", "after"));

    expect(test.contents.get("a.md")).toBe("before");
    expect(test.getStored()).toBeNull();
    expect((Notice as unknown as { readonly messages: string[] }).messages)
      .toContain("notice.batchChanged");
  });

  it("keeps pending and applied recovery snapshots immutable", async () => {
    const test = harness({ "a.md": "before" });

    await applyPreview(test.controller, previewDocument("before", "after"));

    expect(test.persistedSnapshots).toHaveLength(2);
    expect(test.persistedSnapshots[0]?.status).toBe("pending");
    expect(test.persistedSnapshots[1]?.status).toBe("applied");
    expect(test.persistedSnapshots[0]).not.toBe(test.persistedSnapshots[1]);
  });

  it("restores the previous recovery snapshot after a failed batch rolls back cleanly", async () => {
    const previous = await snapshot({ "old.md": "old-after" });
    const test = harness({ "a.md": "before-a", "b.md": "before-b" }, previous);
    test.setProcessHook((_path, call) => {
      if (call === 2) throw new Error("injected write failure");
    });

    await applyPreviews(test.controller, [
      previewDocument("before-a", "after-a", "a.md"),
      previewDocument("before-b", "after-b", "b.md"),
    ]);

    expect(test.contents).toEqual(new Map([
      ["a.md", "before-a"],
      ["b.md", "before-b"],
    ]));
    expect(test.getStored()).toBe(previous);
  });

  it("rejects a same-path TFile replacement after preflight without writing the replacement", async () => {
    const previous = await snapshot({ "old.md": "old-after" });
    const test = harness({ "a.md": "before" }, previous);
    test.setPersistenceHook((next) => {
      if (next?.status === "pending") test.replaceFile("a.md");
    });

    await applyPreview(test.controller, previewDocument("before", "after"));

    expect(test.contents.get("a.md")).toBe("before");
    expect(test.processCalls()).toBe(0);
    expect(test.getStored()).toBe(previous);
    expect((Notice as unknown as { readonly messages: string[] }).messages)
      .toContain("notice.batchChanged");
  });

  it("rejects a rename after preflight and never records or writes the renamed target", async () => {
    const previous = await snapshot({ "old.md": "old-after" });
    const test = harness({ "a.md": "before" }, previous);
    test.setPersistenceHook((next) => {
      if (next?.status === "pending") test.renameFile("a.md", "renamed.md");
    });

    await applyPreview(test.controller, previewDocument("before", "after"));

    expect(test.contents.get("renamed.md")).toBe("before");
    expect(test.processCalls()).toBe(0);
    expect(test.getStored()).toBe(previous);
    expect((Notice as unknown as { readonly messages: string[] }).messages)
      .toContain("notice.batchChanged");
  });

  it("retains the pending recovery snapshot when a file is renamed as its write completes", async () => {
    const previous = await snapshot({ "old.md": "old-after" });
    const test = harness({ "a.md": "before" }, previous);
    test.setProcessAfterHook((_path, call) => {
      if (call === 1) test.renameFile("a.md", "renamed.md");
    });

    await applyPreview(test.controller, previewDocument("before", "after"));

    expect(test.contents.get("renamed.md")).toBe("after");
    expect(test.getStored()).toMatchObject({ status: "pending" });
    expect(test.getStored()).not.toBe(previous);
    expect((Notice as unknown as { readonly messages: string[] }).messages)
      .toContain("notice.batchChanged");
  });

  it("rechecks remaining open editors before every file write", async () => {
    const previous = await snapshot({ "old.md": "old-after" });
    const test = harness({ "a.md": "before-a", "b.md": "before-b" }, previous);
    const second = test.addView("b.md", "before-b");
    test.setProcessAfterHook((_path, call) => {
      if (call === 1) second.setBuffer("unsaved second-file edit");
    });

    await applyPreviews(test.controller, [
      previewDocument("before-a", "after-a", "a.md"),
      previewDocument("before-b", "after-b", "b.md"),
    ]);

    expect(test.contents.get("a.md")).toBe("before-a");
    expect(test.contents.get("b.md")).toBe("before-b");
    expect(test.getStored()).toBe(previous);
    expect((Notice as unknown as { readonly messages: string[] }).messages)
      .toContain("notice.batchChanged");
  });

  it("serializes apply and undo so a second operation cannot overlap", async () => {
    const test = harness({ "a.md": "before" });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    test.setProcessHook(async (_path, call) => {
      if (call === 1) await gate;
    });

    const first = applyPreview(test.controller, previewDocument("before", "after"));
    await vi.waitFor(() => expect(test.processCalls()).toBe(1));
    await test.controller.undo((key) => key);
    expect((Notice as unknown as { readonly messages: string[] }).messages)
      .toContain("notice.batchBusy");
    release();
    await first;

    expect(test.contents.get("a.md")).toBe("after");
    expect(test.processCalls()).toBe(1);
  });
});
