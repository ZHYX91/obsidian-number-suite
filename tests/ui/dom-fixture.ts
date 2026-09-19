interface ElementOptions { text?: string; cls?: string; attr?: Record<string, string>; }

/** The small Obsidian DOM extension surface used by the pane and preview. */
export function installDomFixture(): void {
  const create = function(this: HTMLElement, tag: string, options: ElementOptions = {}) {
    const element = this.ownerDocument.createElement(tag);
    if (options.text != null) element.textContent = options.text;
    if (options.cls != null) element.className = options.cls;
    for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
    this.appendChild(element);
    return element;
  };
  Object.assign(HTMLElement.prototype, {
    empty(this: HTMLElement) { this.replaceChildren(); },
    createEl: create,
    createDiv(this: HTMLElement, options: ElementOptions) { return create.call(this, "div", options); },
    createSpan(this: HTMLElement, options: ElementOptions) { return create.call(this, "span", options); },
    setText(this: HTMLElement, text: string) { this.textContent = text; },
    addClass(this: HTMLElement, name: string) { this.classList.add(name); },
    removeClass(this: HTMLElement, name: string) { this.classList.remove(name); },
  });
}
