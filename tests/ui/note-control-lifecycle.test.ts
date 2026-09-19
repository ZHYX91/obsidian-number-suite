// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TFile, type App } from "obsidian";
import { NoteSaveCoordinator } from "../../src/application/note-save-coordinator";
import { createTranslator } from "../../src/config/i18n";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { clearNoteControlSessions, NoteControlPane } from "../../src/ui/note-control-modal";
import { installDomFixture } from "./dom-fixture";

interface PaneInternals {
  coordinator: NoteSaveCoordinator | null;
  file: TFile | null;
  frontmatter: Record<string, unknown> | null;
  createCoordinator(file: TFile): void;
  reload(): Promise<void>;
  retryDraft(overwrite?: boolean): void;
  reloadLatest(): void;
  applyLevelNumber(kind: "first-number", level: 1, raw: string, input: HTMLInputElement): void;
  finishLevelNumber(kind: "first-number", input: HTMLInputElement): void;
}

beforeEach(installDomFixture);

function harness(initial: Record<string, unknown> = {}) {
  let current = structuredClone(initial);
  let failure: Error | null = null;
  const write = vi.fn(async (_file: TFile, apply: (value: Record<string, unknown>) => void) => {
    if (failure != null) throw failure;
    apply(current);
  });
  const app = {
    fileManager: { processFrontMatter: write },
    vault: { cachedRead: vi.fn().mockResolvedValue("# Fresh") },
  } as unknown as App;
  const host = document.createElement("div");
  const status = document.createElement("div");
  const actions = { refreshDisplay: vi.fn(), runCurrent: vi.fn(), openBatch: vi.fn(), openGlobalSettings: vi.fn() };
  const makePane = () => {
    const pane = new NoteControlPane(app, host, () => DEFAULT_SETTINGS, () => createTranslator("en"), actions);
    Object.assign(pane, { render: vi.fn(), renderLoading: vi.fn(), renderUnavailable: vi.fn(), saveStatus: status });
    return { pane, internal: pane as unknown as PaneInternals };
  };
  const { pane, internal } = makePane();
  const file = new (TFile as unknown as new (path: string) => TFile)("A.md");
  internal.file = file;
  internal.frontmatter = structuredClone(initial);
  internal.createCoordinator(file);
  return { app, pane, internal, file, host, status, write, makePane,
    current: () => current, external: (value: Record<string, unknown>) => { current = value; },
    fail: (error: Error | null) => { failure = error; } };
}

describe("current-note pane lifecycle", () => {
  it("keeps numeric text local until valid blur/Enter commit and shows inline errors", async () => {
    const h = harness();
    const input = h.host.appendChild(document.createElement("input"));
    h.internal.applyLevelNumber("first-number", 1, "3", input);
    h.internal.applyLevelNumber("first-number", 1, "-1", input);
    h.internal.finishLevelNumber("first-number", input);
    await Promise.resolve();
    expect(h.write).not.toHaveBeenCalled();
    expect(h.host.textContent).toContain("whole number");
    expect(h.status.textContent).toContain("Unsaved changes");
    h.internal.applyLevelNumber("first-number", 1, "4", input);
    h.internal.finishLevelNumber("first-number", input);
    await h.internal.coordinator?.flush();
    expect(h.current()["number-suite"]).toEqual(["heading.first-number.h1=4"]);
    expect(h.status.textContent).toBe("Saved");
    h.pane.destroy();
  });

  it("does not commit an input belonging to the previous file", async () => {
    const h = harness();
    const input = document.createElement("input");
    h.internal.applyLevelNumber("first-number", 1, "3", input);
    h.pane.setFile(null, false);
    h.internal.finishLevelNumber("first-number", input);
    await Promise.resolve();
    expect(h.write).not.toHaveBeenCalled();
    h.pane.destroy();
  });

  it("shows conflicting values and requires explicit application without losing other edits", async () => {
    const h = harness({ "number-suite": ["heading.first-number.h1=2"] });
    h.internal.coordinator?.update({ kind: "first-number", level: 1, value: 3 });
    h.external({ owner: "external", "number-suite": ["heading.first-number.h1=7", "heading.skip-first.h2=4"] });
    await h.internal.coordinator?.flush();
    h.internal.retryDraft();
    expect(h.status.textContent).toContain("latest saved value = 7; your change = 3");
    expect(h.current()["number-suite"]).toContain("heading.first-number.h1=7");
    h.internal.retryDraft(true);
    await h.internal.coordinator?.flush();
    expect(h.current()).toEqual({ owner: "external", "number-suite": ["heading.first-number.h1=3", "heading.skip-first.h2=4"] });
    h.pane.destroy();
  });

  it("retains failed drafts through switching and reopening a pane", async () => {
    const h = harness();
    h.fail(new Error("offline"));
    const coordinator = h.internal.coordinator;
    coordinator?.update({ kind: "show-virtual", value: "off" });
    await coordinator?.flush();
    h.pane.setFile(null, false);
    await coordinator?.flush();
    h.pane.destroy();
    const reopened = h.makePane();
    reopened.pane.setFile(h.file);
    expect(reopened.internal.coordinator).toBe(coordinator);
    expect(reopened.internal.coordinator?.snapshot["number-suite"]).toEqual(["heading.virtual=false"]);
    h.fail(null);
    reopened.internal.retryDraft();
    await coordinator?.flush();
    expect(h.current()["number-suite"]).toEqual(["heading.virtual=false"]);
    reopened.pane.destroy();
    clearNoteControlSessions(h.app);
  });

  it("allows discarding a conflict with invalid external Properties without writing over them", async () => {
    const h = harness();
    h.internal.coordinator?.update({ kind: "show-virtual", value: "on" });
    h.external({ "number-suite": ["invalid"] });
    await h.internal.coordinator?.flush();
    const writes = h.write.mock.calls.length;
    h.internal.reloadLatest();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.write).toHaveBeenCalledTimes(writes);
    expect(h.current()["number-suite"]).toEqual(["invalid"]);
    expect(h.internal.coordinator?.pending).toBe(false);
    h.pane.destroy();
  });
});
