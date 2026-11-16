// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReferencePillElement } from "../../src/ui/virtual-numeral";

describe("rendered reference activation", () => {
  let host: HTMLDivElement;
  let pill: HTMLSpanElement;

  beforeEach(() => {
    window.Node.prototype.createSpan = function createSpan(): HTMLSpanElement {
      const span = document.createElement("span");
      this.appendChild(span);
      return span;
    };
    Object.defineProperty(document, "win", { configurable: true, value: window });
    Object.assign(window, { createFragment: () => document.createDocumentFragment() });
    host = document.createElement("div");
    host.contentEditable = "true";
    pill = createReferencePillElement(document, "2.3 Target");
    host.append(pill);
    document.body.append(host);
  });

  afterEach(() => host.remove());

  const down = (target: HTMLElement, options: PointerEventInit = {}): PointerEvent => {
    const event = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      clientX: 10,
      clientY: 10,
      ...options,
    });
    target.dispatchEvent(event);
    return event;
  };
  const click = (target: HTMLElement, options: MouseEventInit = {}): MouseEvent => {
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 1,
      ...options,
    });
    target.dispatchEvent(event);
    return event;
  };

  it("keeps the widget alive until the first plain click navigates", () => {
    const edit = vi.fn(() => pill.replaceWith(document.createTextNode("@[[#Target]]")));
    const touchEdit = vi.fn();
    const navigate = vi.fn();
    host.addEventListener("mousedown", edit);
    host.addEventListener("pointerdown", touchEdit);
    pill.addEventListener("click", navigate);

    down(pill);
    const mouse = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    pill.dispatchEvent(mouse);
    expect(mouse.defaultPrevented).toBe(true);
    expect(edit).not.toHaveBeenCalled();
    expect(touchEdit).not.toHaveBeenCalled();
    expect(pill.isConnected).toBe(true);
    click(pill);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("does not prevent the browser's touch scrolling default", () => {
    expect(down(pill, { pointerType: "touch" }).defaultPrevented).toBe(false);
  });

  it("does not intercept pointer or selection events starting in adjacent prose", () => {
    const prose = document.createElement("span");
    prose.textContent = "Surrounding text";
    host.append(prose);
    const pointer = vi.fn();
    const mouse = vi.fn();
    host.addEventListener("pointerdown", pointer);
    host.addEventListener("mousedown", mouse);
    down(prose);
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    prose.dispatchEvent(event);
    expect(pointer).toHaveBeenCalledOnce();
    expect(mouse).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(["shiftKey", "altKey", "ctrlKey", "metaKey"] as const)(
    "leaves %s pointer placement to the editor instead of plain navigation",
    (modifier) => {
      const editorPointer = vi.fn();
      const editorMouse = vi.fn();
      const navigate = vi.fn();
      host.addEventListener("pointerdown", editorPointer);
      host.addEventListener("mousedown", editorMouse);
      pill.addEventListener("click", navigate);
      down(pill, { [modifier]: true });
      const mouse = new MouseEvent("mousedown", {
        bubbles: true, cancelable: true, button: 0, [modifier]: true,
      });
      pill.dispatchEvent(mouse);
      expect(editorPointer).toHaveBeenCalledOnce();
      expect(editorMouse).toHaveBeenCalledOnce();
      expect(mouse.defaultPrevented).toBe(false);
      click(pill, { [modifier]: true });
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it("preserves right-click context menus", () => {
    const context = vi.fn();
    const mouse = vi.fn();
    host.addEventListener("contextmenu", context);
    host.addEventListener("mousedown", mouse);
    down(pill, { button: 2 });
    const right = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 2 });
    pill.dispatchEvent(right);
    pill.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
    expect(right.defaultPrevented).toBe(false);
    expect(context).toHaveBeenCalledOnce();
    expect(mouse).toHaveBeenCalledOnce();
  });

  it.each(["pointermove", "pointerup"])("rejects a drag detected by %s", (type) => {
    const navigate = vi.fn();
    pill.addEventListener("click", navigate);
    down(pill);
    pill.dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: 1, clientX: 30, clientY: 10,
    }));
    expect(click(pill).defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(["pointerleave", "pointercancel"])("does not activate after %s", (type) => {
    const navigate = vi.fn();
    pill.addEventListener("click", navigate);
    down(pill);
    pill.dispatchEvent(new PointerEvent(type, { pointerId: 1 }));
    click(pill);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("cancels when another finger starts on the reference", () => {
    const navigate = vi.fn();
    pill.addEventListener("click", navigate);
    down(pill, { pointerType: "touch" });
    down(pill, { pointerId: 2, pointerType: "touch", isPrimary: false });
    click(pill);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("prevents native dragging from causing a subsequent jump", () => {
    const navigate = vi.fn();
    pill.addEventListener("click", navigate);
    down(pill);
    const drag = new Event("dragstart", { cancelable: true });
    pill.dispatchEvent(drag);
    click(pill);
    expect(drag.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("accepts small pointer jitter as a tap", () => {
    const navigate = vi.fn();
    pill.addEventListener("click", navigate);
    down(pill);
    pill.dispatchEvent(new PointerEvent("pointerup", {
      pointerId: 1, clientX: 13, clientY: 14,
    }));
    click(pill);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("resets cancellation for the next independent click", () => {
    const navigate = vi.fn();
    pill.addEventListener("click", navigate);
    down(pill);
    pill.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));
    click(pill);
    down(pill);
    click(pill);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("does not block keyboard/assistive activation after a canceled pointer", () => {
    const navigate = vi.fn();
    pill.addEventListener("click", navigate);
    down(pill);
    pill.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }));
    click(pill, { detail: 0 });
    expect(navigate).toHaveBeenCalledOnce();
  });

  it.each(["ArrowLeft", "ArrowRight", "Enter", " "])("does not consume %s keyboard events", (key) => {
    const editorKey = vi.fn();
    host.addEventListener("keydown", editorKey);
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    pill.dispatchEvent(event);
    expect(editorKey).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
  });
});
