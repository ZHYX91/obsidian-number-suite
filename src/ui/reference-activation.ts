/**
 * Keep a rendered reference alive until its click handler runs. CodeMirror's
 * pointer/mousedown handling would otherwise place the caret in the replaced
 * source, remove the widget, and consume the first click as an edit gesture.
 *
 * Only events starting on this reference are isolated. Keyboard movement into
 * the source, Shift-click selection, context menus and drags starting in prose
 * remain editor operations. Touch scrolling is not prevented.
 */
export function protectReferenceActivation(element: HTMLElement): void {
  let pointer: { id: number; x: number; y: number } | null = null;
  let canceled = false;

  const primaryActivation = (event: MouseEvent): boolean => (
    event.button === 0 && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
  );
  const moved = (event: PointerEvent): boolean => pointer != null
    && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8;

  element.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) {
      if (pointer != null) canceled = true;
      return;
    }
    if (!primaryActivation(event)) {
      pointer = null;
      canceled = true;
      return;
    }
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canceled = false;
    // In particular, do not start the editor's Android touch-edit/IME reveal.
    // Do not preventDefault here: vertical scrolling and pinch gestures remain
    // the browser's. The compatibility mousedown below prevents caret placement.
    event.stopPropagation();
  });
  element.addEventListener("mousedown", (event) => {
    if (!primaryActivation(event)) return;
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener("pointermove", (event) => {
    if (pointer?.id === event.pointerId && moved(event)) canceled = true;
  });
  element.addEventListener("pointerleave", (event) => {
    if (pointer?.id === event.pointerId) canceled = true;
  });
  element.addEventListener("pointerup", (event) => {
    if (pointer?.id !== event.pointerId) return;
    canceled ||= moved(event);
    pointer = null;
  });
  element.addEventListener("pointercancel", (event) => {
    if (pointer?.id !== event.pointerId) return;
    canceled = true;
    pointer = null;
  });
  element.addEventListener("dragstart", (event) => {
    canceled = true;
    event.preventDefault();
  });
  element.addEventListener("click", (event) => {
    // detail=0 is keyboard/assistive activation, not the end of a pointer drag.
    // Modifier clicks belong to the editor; never convert them to plain jumps.
    if (!primaryActivation(event) || (canceled && event.detail !== 0)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}
