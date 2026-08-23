export class App {}

export class MarkdownView {
  file: TFile | null = null;

  async save(): Promise<void> {}
}

export class Notice {
  static readonly messages: string[] = [];

  constructor(message: string) {
    Notice.messages.push(message);
  }
}

export function getLanguage(): string {
  return "en";
}

export function getFrontMatterInfo(_source: string) {
  return { exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 };
}

export function parseYaml(_source: string): unknown {
  return null;
}

export class PluginSettingTab {
  containerEl: HTMLElement;

  constructor(public app: App, public plugin: unknown) {
    this.containerEl = typeof document === "undefined"
      ? {} as HTMLElement
      : document.createElement("div");
  }

  display(): void {}

  hide(): void {}

  update(): void {}
}

export class Modal {
  contentEl: HTMLElement;

  constructor(public app: App) {
    this.contentEl = typeof document === "undefined"
      ? {} as HTMLElement
      : document.createElement("div");
  }

  setTitle(_title: string): void {}

  open(): void {}

  close(): void {}
}

export class FuzzySuggestModal<T> extends Modal {
  setPlaceholder(_placeholder: string): void {}

  getItems(): T[] { return []; }

  getItemText(_item: T): string { return ""; }

  onChooseItem(_item: T): void {}
}

export class Setting {
  settingEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl;
  }

  setName(_name: string): this { return this; }

  setDesc(_desc: string): this { return this; }

  setHeading(): this { return this; }

  addButton(_callback: (button: unknown) => void): this { return this; }
}

export class TFile {
  path: string;
  extension: string;

  constructor(path: string) {
    this.path = path;
    this.extension = path.split(".").pop() ?? "";
  }
}

export class TFolder {
  constructor(public path: string) {}
}

export function normalizePath(path: string): string {
  return path;
}

export function setIcon(_element: HTMLElement, _iconId: string): void {}
