export type SettingsTabId = "general" | "headings" | "captions" | "references" | "notes" | "cleanup" | "views";

export interface SettingsTabDefinition {
  readonly id: SettingsTabId;
  readonly label: string;
}
export function createSettingsTabs(
  container: HTMLElement,
  definitions: readonly SettingsTabDefinition[],
  activeId: SettingsTabId,
  ariaLabel: string,
  scrollLabels: { readonly earlier: string; readonly later: string },
  onSelect: (id: SettingsTabId) => void,
): { panel: HTMLElement; cleanup: () => void } {
  const panelId = `number-suite-settings-panel-${activeId}`;
  const strip = container.createDiv();
  strip.className = "number-suite-settings-tab-strip";
  const list = strip.createDiv();
  list.className = "number-suite-settings-tabs";
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", ariaLabel);
  list.setAttribute("aria-orientation", "horizontal");
  const listeners: Array<() => void> = [];
  const buttons = definitions.map((definition, index) => {
    const button = list.createEl("button");
    const active = definition.id === activeId;
    button.type = "button";
    button.className = `number-suite-settings-tab${active ? " is-active" : ""}`;
    button.textContent = definition.label;
    button.id = `number-suite-settings-tab-${definition.id}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(active));
    button.setAttribute("aria-controls", panelId);
    button.tabIndex = active ? 0 : -1;
    const click = (): void => onSelect(definition.id);
    const keydown = (event: KeyboardEvent): void => {
      let target = index;
      const inlineDirection = isRightToLeft(button) ? -1 : 1;
      if (event.key === "ArrowRight") {
        target = (index + inlineDirection + definitions.length) % definitions.length;
      } else if (event.key === "ArrowLeft") {
        target = (index - inlineDirection + definitions.length) % definitions.length;
      } else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = definitions.length - 1;
      else return;
      event.preventDefault();
      const next = definitions[target];
      if (next != null) onSelect(next.id);
    };
    button.addEventListener("click", click);
    button.addEventListener("keydown", keydown);
    listeners.push(() => {
      button.removeEventListener("click", click);
      button.removeEventListener("keydown", keydown);
    });
    return button;
  });
  const panel = container.createDiv({ cls: "number-suite-settings-panel" });
  panel.id = panelId;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", `number-suite-settings-tab-${activeId}`);
  panel.tabIndex = 0;
  const activeButton = buttons.find((button) => button.classList.contains("is-active"));
  if (activeButton) {
    listeners.push(installTabOverflow(strip, list, buttons, activeButton, scrollLabels));
    const viewport = list.getBoundingClientRect();
    const selected = activeButton.getBoundingClientRect();
    if (selected.left < viewport.left) list.scrollLeft += selected.left - viewport.left;
    else if (selected.right > viewport.right) list.scrollLeft += selected.right - viewport.right;
  }
  return { panel, cleanup: () => listeners.reverse().forEach((cleanup) => cleanup()) };
}

function isRightToLeft(element: HTMLElement): boolean {
  const explicitDirection = element.closest<HTMLElement>("[dir]")?.dir;
  if (explicitDirection === "rtl") return true;
  if (explicitDirection === "ltr") return false;
  if (element.ownerDocument.documentElement.dir === "rtl") return true;
  return element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl";
}

// The two gutters appear together only when the uncropped row overflows.
// Keeping them stable prevents the first or last tab from moving as a button hides.
function installTabOverflow(
  strip: HTMLElement,
  list: HTMLElement,
  tabs: readonly HTMLButtonElement[],
  active: HTMLButtonElement,
  labels: { readonly earlier: string; readonly later: string },
): () => void {
  const view = list.ownerDocument.defaultView;
  const earlier = scrollButton("earlier");
  const later = scrollButton("later");
  strip.prepend(earlier);
  strip.append(later);

  function scrollButton(direction: "earlier" | "later"): HTMLButtonElement {
    const button = strip.createEl("button");
    button.type = "button";
    button.className = "number-suite-settings-tab-scroll";
    button.dataset.direction = direction;
    button.hidden = true;
    button.title = labels[direction];
    button.setAttribute("aria-label", labels[direction]);
    return button;
  }

  function nextDelta(toLeft: boolean): number {
    const viewport = list.getBoundingClientRect();
    let nearest = Infinity;
    for (const tab of tabs) {
      const rect = tab.getBoundingClientRect();
      const distance = toLeft ? viewport.left - rect.left : rect.right - viewport.right;
      if (distance > 1) nearest = Math.min(nearest, distance);
    }
    if (!Number.isFinite(nearest)) return 0;
    return toLeft ? -nearest : nearest;
  }

  function refresh(): void {
    const overflow = strip.clientWidth > 0 && list.scrollWidth > strip.clientWidth;
    strip.classList.toggle("has-overflow", overflow);
    const rtl = isRightToLeft(list);
    const focus = strip.ownerDocument.activeElement;
    earlier.hidden = !overflow || nextDelta(!rtl) === 0;
    later.hidden = !overflow || nextDelta(rtl) === 0;
    if ((focus === earlier && earlier.hidden) || (focus === later && later.hidden)) {
      const next = [earlier, later].find((button) => !button.hidden) ?? active;
      next.focus({ preventScroll: true });
    }
  }

  function scroll(event: MouseEvent): void {
    const rtl = isRightToLeft(list);
    const toLeft = event.currentTarget === earlier ? !rtl : rtl;
    list.scrollLeft += nextDelta(toLeft);
    refresh();
  }

  earlier.addEventListener("click", scroll);
  later.addEventListener("click", scroll);
  list.addEventListener("scroll", refresh, { passive: true });
  view?.addEventListener("resize", refresh);
  const observer = view?.ResizeObserver && new view.ResizeObserver(refresh);
  observer?.observe(strip);
  for (const tab of tabs) observer?.observe(tab);
  refresh();
  return () => {
    earlier.removeEventListener("click", scroll);
    later.removeEventListener("click", scroll);
    list.removeEventListener("scroll", refresh);
    view?.removeEventListener("resize", refresh);
    observer?.disconnect();
  };
}
