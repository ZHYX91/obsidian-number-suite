/**
 * A rendered cross-reference should own activation, without claiming ordinary
 * text selection, composition, or editing of its underlying Markdown.
 */
export interface ReferenceActivationOptions {
  /** Immutable source document identity for the current widget. */
  sourceToken: () => unknown;
  /** Refuse detached widgets and navigation during IME composition. */
  available: () => boolean;
  navigate: () => void;
}

interface Press {
  pointerId: number | null;
  source: unknown;
  x: number;
  y: number;
  startedAt: number;
  released: boolean;
  cancelled: boolean;
}

function modified(event: Event): boolean {
  const keys = event as Partial<MouseEvent>;
  return keys.altKey === true || keys.ctrlKey === true
    || keys.metaKey === true || keys.shiftKey === true;
}

function primary(event: MouseEvent): boolean {
  return event.button === 0 && !modified(event);
}

/** Leave selection modifiers, context menus and editing keys to CodeMirror. */
export function referenceIgnoresEditorEvent(event: Event): boolean {
  if (event.type === "keydown") {
    const key = event as KeyboardEvent;
    return !key.isComposing && !modified(event) && (key.key === "Enter" || key.key === " ");
  }
  if (event.type === "mousedown" || event.type === "mouseup" || event.type === "click") {
    return primary(event as MouseEvent);
  }
  if (event.type.startsWith("pointer") || event.type.startsWith("touch")) {
    return !modified(event);
  }
  return false;
}

/**
 * Keep a reference replacement mounted until click. A drag, long press,
 * secondary pointer or stale document must never activate a reference.
 */
export function bindReferenceActivation(
  element: HTMLElement,
  options: ReferenceActivationOptions,
): void {
  let press: Press | null = null;
  const cancel = (): void => {
    if (press != null) press.cancelled = true;
  };
  const begin = (event: MouseEvent, pointerId: number | null): void => {
    press = {
      pointerId,
      source: options.sourceToken(),
      x: event.clientX,
      y: event.clientY,
      startedAt: event.timeStamp,
      released: false,
      cancelled: !primary(event) || !options.available(),
    };
  };
  const moved = (event: MouseEvent): boolean => press != null
    && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8;
  const finish = (event: MouseEvent): void => {
    if (press == null) return;
    if (moved(event) || event.timeStamp - press.startedAt >= 600) cancel();
    press.released = true;
  };

  element.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) {
      cancel();
      return;
    }
    begin(event, event.pointerId);
  });
  element.addEventListener("pointermove", (event) => {
    if (press?.pointerId === event.pointerId && moved(event)) cancel();
  });
  element.addEventListener("pointerup", (event) => {
    if (press?.pointerId === event.pointerId) finish(event);
  });
  element.addEventListener("pointercancel", cancel);
  element.addEventListener("pointerleave", cancel);
  element.addEventListener("contextmenu", cancel);
  element.addEventListener("dragstart", cancel);
  element.addEventListener("touchstart", (event) => {
    if (event.touches.length > 1) cancel();
  }, { passive: true });

  element.addEventListener("mousedown", (event) => {
    if (!primary(event)) {
      cancel();
      return;
    }
    // Compatibility mouse events may follow pointer events: retain their
    // cancellation and source identity, and also support mouse-only hosts.
    if (press == null || press.pointerId == null) begin(event, null);
    event.preventDefault();
  });
  element.addEventListener("mousemove", (event) => {
    if (press?.pointerId == null && moved(event)) cancel();
  });
  element.addEventListener("mouseup", (event) => {
    if (press?.pointerId == null) finish(event);
  });
  element.addEventListener("mouseleave", cancel);

  element.addEventListener("click", (event) => {
    const current = press;
    press = null;
    if (!primary(event) || event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    if (!options.available()) return;
    if (event.detail !== 0 && (
      current == null || !current.released || current.cancelled
      || current.source !== options.sourceToken()
    )) return;
    options.navigate();
  });
  element.addEventListener("keydown", (event) => {
    if (event.isComposing || modified(event) || (event.key !== "Enter" && event.key !== " ")) return;
    if (event.defaultPrevented) return;
    event.preventDefault();
    event.stopPropagation();
    press = null;
    if (!event.repeat && options.available()) options.navigate();
  });
}
