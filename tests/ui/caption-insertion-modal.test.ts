// @vitest-environment happy-dom

import { beforeEach, expect, it, vi } from "vitest";
import { App } from "obsidian";

import { installDomFixture } from "./dom-fixture";
import { createTranslator } from "../../src/config/i18n";
import { createCaptionInsertionPlanForTarget, findCaptionInsertionTarget } from "../../src/core/caption-insertion";
import { CaptionInsertionModal } from "../../src/ui/caption-insertion-modal";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("obsidian")>(),
  Modal: class {
    readonly contentEl = document.createElement("div");
    readonly titleEl = document.createElement("h2");
    readonly modalEl = document.createElement("div");
    constructor() { this.modalEl.append(this.titleEl, this.contentEl); }
    close(): void { (this as unknown as { onClose(): void }).onClose(); }
  },
  Setting: class {
    constructor(readonly container: HTMLElement) {}
    setName(): this { return this; }
    addText(configure: (text: unknown) => void): this {
      const inputEl = this.container.createEl("input");
      const text = {
        inputEl,
        setPlaceholder(value: string) { inputEl.placeholder = value; return text; },
        setValue(value: string) { inputEl.value = value; return text; },
        onChange(callback: (value: string) => void) {
          inputEl.addEventListener("input", () => callback(inputEl.value));
          return text;
        },
      };
      configure(text);
      return this;
    }
    addButton(configure: (button: unknown) => void): this {
      const buttonEl = this.container.createEl("button");
      const button = {
        setButtonText(value: string) { buttonEl.textContent = value; return button; },
        setDisabled(value: boolean) { buttonEl.disabled = value; return button; },
        setCta() { return button; },
        onClick(callback: () => void) { buttonEl.addEventListener("click", callback); return button; },
      };
      configure(button);
      return this;
    }
  },
}));

beforeEach(() => { installDomFixture(); });

it.each([true, false])("runs the applied callback after close only for a successful write: %s", async (applied) => {
  const target = findCaptionInsertionTarget("![[cat.png]]", 4);
  if (target === null) throw new Error("Expected an insertion target");
  const events: string[] = [];
  const modal = new CaptionInsertionModal({
    app: new App(), target, translate: createTranslator("en"),
    onConfirm: async () => { events.push("apply"); return applied; },
    onApplied: () => { events.push("focus"); },
  });
  vi.spyOn(modal, "close").mockImplementation(() => { events.push("close"); });
  modal.onOpen();
  const buttons = modal.contentEl.querySelectorAll("button");
  buttons[1]?.click();
  await Promise.resolve();
  expect(events).toEqual(applied ? ["apply", "close", "focus"] : ["apply", "close"]);
});

it("previews the retained caption IDs exactly while editing only the visible title", () => {
  const source = "![[cat.png]]\n\n  Figure: Cat ^cat-id\n^second-id";
  const target = findCaptionInsertionTarget(source, source.indexOf("cat.png"));
  if (target === null) throw new Error("Expected a caption relocation");
  const modal = new CaptionInsertionModal({
    app: new App(), target, translate: createTranslator("en"), onConfirm: vi.fn(async () => undefined),
  });
  modal.onOpen();
  const input = modal.contentEl.querySelector<HTMLInputElement>("input");
  if (input === null) throw new Error("Expected the title control");
  expect(input.value).toBe("Cat");
  const preview = modal.contentEl.querySelector("code");
  expect(preview?.textContent).toBe("  Figure: Cat ^cat-id\n^second-id");
  input.value = "A sleeping cat";
  input.dispatchEvent(new Event("input"));
  const plan = createCaptionInsertionPlanForTarget(source, target, input.value);
  expect(preview?.textContent).toBe("  Figure: A sleeping cat ^cat-id\n^second-id");
  expect(plan?.result).toContain(`${preview?.textContent}\n\n![[cat.png]]`);
});

it("closes on owner abort and ignores a pending completion's focus callback", async () => {
  const target = findCaptionInsertionTarget("![[cat.png]]", 4)!;
  const owner = new AbortController();
  let finish!: (result: boolean) => void;
  const onApplied = vi.fn();
  const modal = new CaptionInsertionModal({ app: new App(), target, translate: createTranslator("en"),
    signal: owner.signal, onConfirm: () => new Promise<boolean>((resolve) => { finish = resolve; }), onApplied });
  const removed = vi.spyOn(owner.signal, "removeEventListener");
  modal.onOpen();
  modal.contentEl.querySelectorAll<HTMLButtonElement>("button")[1]!.click();
  owner.abort();
  expect(modal.contentEl.childElementCount).toBe(0);
  expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
  finish(true);
  await Promise.resolve();
  expect(onApplied).not.toHaveBeenCalled();
});
