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
  onSelect: (id: SettingsTabId) => void,
): { panel: HTMLElement; cleanup: () => void } {
  const document = container.ownerDocument;
  const list = container.createDiv({ cls: "number-suite-settings-tabs" });
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
    button.setAttribute("aria-controls", `number-suite-settings-panel-${definition.id}`);
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
  panel.id = `number-suite-settings-panel-${activeId}`;
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", `number-suite-settings-tab-${activeId}`);
  panel.tabIndex = 0;
  const activeButton = buttons.find((button) => button.classList.contains("is-active"));
  document.defaultView?.requestAnimationFrame(() => (
    activeButton?.scrollIntoView({ block: "nearest", inline: "nearest" })
  ));
  return { panel, cleanup: () => listeners.reverse().forEach((cleanup) => cleanup()) };
}

function isRightToLeft(element: HTMLElement): boolean {
  const explicitDirection = element.closest<HTMLElement>("[dir]")?.dir;
  if (explicitDirection === "rtl") return true;
  if (explicitDirection === "ltr") return false;
  if (element.ownerDocument.documentElement.dir === "rtl") return true;
  return element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl";
}
