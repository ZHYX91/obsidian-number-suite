export interface SidebarTabDefinition<TabId extends string> {
  readonly id: TabId;
  readonly label: string;
}

export interface SidebarTabsController<TabId extends string> {
  readonly buttons: ReadonlyMap<TabId, HTMLButtonElement>;
  destroy(): void;
  setAriaLabel(ariaLabel: string): void;
  update(activeId: TabId): void;
}

export function sidebarTabElementId(tabId: string): string {
  return `number-suite-sidebar-tab-${tabId}`;
}

export function sidebarPanelElementId(tabId: string): string {
  return `number-suite-sidebar-panel-${tabId}`;
}

export function createSidebarTabs<TabId extends string>(
  container: HTMLElement,
  definitions: readonly SidebarTabDefinition<TabId>[],
  activeId: TabId,
  ariaLabel: string,
  onSelect: (tabId: TabId) => void,
): SidebarTabsController<TabId> {
  const list = container.createDiv({ cls: "number-suite-sidebar-tabs" });
  list.setAttribute("role", "tablist");
  list.setAttribute("aria-label", ariaLabel);
  list.setAttribute("aria-orientation", "horizontal");
  const buttons = new Map<TabId, HTMLButtonElement>();
  const cleanups: Array<() => void> = [];
  const revealAndFocus = (tabId: TabId): void => {
    queueMicrotask(() => {
      const button = buttons.get(tabId);
      if (button?.getAttribute("aria-selected") !== "true") return;
      button.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      button.focus({ preventScroll: true });
    });
  };

  definitions.forEach((definition, index) => {
    const button = list.createEl("button", { cls: "number-suite-sidebar-tab" });
    button.type = "button";
    button.id = sidebarTabElementId(definition.id);
    button.textContent = definition.label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", sidebarPanelElementId(definition.id));
    const select = (): void => {
      onSelect(definition.id);
      revealAndFocus(definition.id);
    };
    const keydown = (event: KeyboardEvent): void => {
      const target = moveHorizontalTabIndex(
        index,
        event.key,
        definitions.length,
        isRightToLeft(button),
      );
      if (target === null || target === index) return;
      const next = definitions[target];
      if (next === undefined) return;
      event.preventDefault();
      onSelect(next.id);
      revealAndFocus(next.id);
    };
    button.addEventListener("click", select);
    button.addEventListener("keydown", keydown);
    cleanups.push(() => {
      button.removeEventListener("click", select);
      button.removeEventListener("keydown", keydown);
    });
    buttons.set(definition.id, button);
  });

  const update = (nextActiveId: TabId): void => {
    for (const [tabId, button] of buttons) {
      const active = tabId === nextActiveId;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
  };
  update(activeId);

  return {
    buttons,
    update,
    destroy: () => cleanups.reverse().forEach((cleanup) => cleanup()),
    setAriaLabel: (nextAriaLabel) => list.setAttribute("aria-label", nextAriaLabel),
  };
}

export function moveHorizontalTabIndex(
  currentIndex: number,
  key: string,
  tabCount: number,
  rightToLeft: boolean,
): number | null {
  if (tabCount <= 0 || currentIndex < 0 || currentIndex >= tabCount) return null;
  if (key === "Home") return 0;
  if (key === "End") return tabCount - 1;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const visualStep = key === "ArrowRight" ? 1 : -1;
  const logicalStep = rightToLeft ? -visualStep : visualStep;
  return (currentIndex + logicalStep + tabCount) % tabCount;
}

function isRightToLeft(element: HTMLElement): boolean {
  const explicitDirection = element.closest<HTMLElement>("[dir]")?.dir;
  if (explicitDirection === "rtl") return true;
  if (explicitDirection === "ltr") return false;
  if (element.ownerDocument.documentElement.dir === "rtl") return true;
  return element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl";
}
