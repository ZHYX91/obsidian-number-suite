import { beforeEach, describe, expect, it } from "vitest";

import { Notice, TFile, type App } from "obsidian";

import { BatchController, type BatchPersistence } from "../../src/commands/batch";
import { DEFAULT_SETTINGS, type LastBatchSnapshot } from "../../src/config/settings";
import { digestText } from "../../src/core/text-digest";

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

function harness(initial: Readonly<Record<string, string>>, initialSnapshot: LastBatchSnapshot) {
  const contents = new Map(Object.entries(initial));
  const FileConstructor = TFile as unknown as new (path: string) => TFile;
  const files = new Map([...contents.keys()].map((path) => [path, new FileConstructor(path)]));
  let stored: LastBatchSnapshot | null = initialSnapshot;
  let processHook: ((path: string, call: number) => void) | null = null;
  let processCalls = 0;
  const vault = {
    getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    cachedRead: async (file: TFile) => contents.get(file.path) ?? "",
    process: async (file: TFile, transform: (current: string) => string) => {
      processCalls += 1;
      processHook?.(file.path, processCalls);
      const current = contents.get(file.path);
      if (current == null) throw new Error(`Missing ${file.path}`);
      const next = transform(current);
      contents.set(file.path, next);
      return next;
    },
  };
  const app = {
    vault,
    workspace: { iterateAllLeaves: () => undefined },
  } as unknown as App;
  const persistence: BatchPersistence = {
    getLastBatch: () => stored,
    setLastBatch: async (next) => { stored = next; },
  };
  return {
    contents,
    controller: new BatchController(app, () => DEFAULT_SETTINGS, persistence),
    getStored: () => stored,
    setProcessHook: (hook: typeof processHook) => { processHook = hook; },
  };
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
});
