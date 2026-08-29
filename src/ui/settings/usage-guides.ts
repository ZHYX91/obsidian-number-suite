import { setIcon } from "obsidian";

import type { Translate } from "../../config/i18n";

type MessageKey = Parameters<Translate>[0];

function createGuide(
  container: HTMLElement,
  id: string,
  title: string,
): HTMLElement {
  const guide = container.createDiv({
    cls: `number-suite-settings-guide number-suite-${id}-guide`,
  });
  guide.setAttribute("role", "note");
  const titleId = `number-suite-${id}-guide-title`;
  guide.setAttribute("aria-labelledby", titleId);

  const heading = guide.createDiv({ cls: "number-suite-settings-guide-heading" });
  const icon = heading.createSpan({
    cls: "number-suite-settings-guide-icon",
    attr: { "aria-hidden": "true" },
  });
  setIcon(icon, "info");
  const titleElement = heading.createEl("strong", { text: title });
  titleElement.id = titleId;
  return guide.createDiv({ cls: "number-suite-settings-guide-body" });
}

function renderExample(
  container: HTMLElement,
  title: string,
  source: string,
  result: string,
): void {
  const example = container.createDiv({ cls: "number-suite-settings-guide-example" });
  example.createEl("strong", { text: title });
  const pre = example.createEl("pre");
  pre.createEl("code", { text: source });
  example.createEl("p", { text: result });
}

function renderCaptionPreview(container: HTMLElement, values: readonly string[]): void {
  const preview = container.createDiv({ cls: "number-suite-settings-rendered-example" });
  for (const value of values) preview.createSpan({ cls: "number-suite-caption-pill", text: value });
}

function renderHeadingPreview(container: HTMLElement, number: string, title: string): void {
  const preview = container.createDiv({ cls: "number-suite-settings-rendered-example" });
  preview.createSpan({ cls: "number-suite-heading-number", text: number });
  preview.createSpan({ text: title });
}

function renderList(
  container: HTMLElement,
  t: Translate,
  keys: readonly MessageKey[],
  ordered = false,
): void {
  const list = container.createEl(ordered ? "ol" : "ul", {
    cls: "number-suite-settings-guide-list",
  });
  for (const key of keys) list.createEl("li", { text: t(key) });
}

export function renderHeadingDisplayGuide(container: HTMLElement, t: Translate): void {
  const body = createGuide(container, "heading-display", t("settings.headings.guide.title"));
  body.createEl("p", { text: t("settings.headings.guide.intro") });
  renderExample(
    body,
    t("settings.headings.guide.example.title"),
    t("settings.headings.guide.example.source"),
    t("settings.headings.guide.example.result"),
  );
  renderHeadingPreview(
    body,
    t("settings.headings.guide.example.preview.number"),
    t("settings.headings.guide.example.preview.title"),
  );
  renderList(body, t, [
    "settings.headings.guide.virtual",
    "settings.headings.guide.conceal",
    "settings.headings.guide.together",
    "settings.headings.guide.views",
  ]);
  body.createEl("p", { text: t("settings.headings.guide.write") });
}

export function renderCaptionNumberingGuide(container: HTMLElement, t: Translate): void {
  const body = createGuide(container, "caption", t("settings.captions.guide.title"));
  body.createEl("p", { text: t("settings.captions.guide.intro") });
  renderExample(
    body,
    t("settings.captions.guide.example.title"),
    t("settings.captions.guide.example.source"),
    t("settings.captions.guide.example.result"),
  );
  renderCaptionPreview(body, [
    t("settings.captions.guide.example.preview.figure"),
    t("settings.captions.guide.example.preview.table"),
  ]);
  renderList(body, t, [
    "settings.captions.guide.exact",
    "settings.captions.guide.counter",
    "settings.captions.guide.binding",
    "settings.captions.guide.safety",
    "settings.captions.guide.placement",
    "settings.captions.guide.hover",
    "settings.captions.guide.editing",
    "settings.captions.guide.blockId",
    "settings.captions.guide.reference",
  ]);
}

export function renderFileOperationsGuide(container: HTMLElement, t: Translate): void {
  const body = createGuide(container, "file-operations", t("settings.operations.guide.title"));
  body.createEl("p", { text: t("settings.operations.guide.intro") });
  renderList(body, t, [
    "settings.operations.guide.step.open",
    "settings.operations.guide.step.choose",
    "settings.operations.guide.step.preview",
  ], true);
  body.createEl("p", { text: t("settings.operations.guide.operations") });
  body.createEl("p", { text: t("settings.operations.guide.safety") });
}

export function renderBatchOperationsGuide(container: HTMLElement, t: Translate): void {
  const body = createGuide(container, "batch", t("settings.batch.guide.title"));
  body.createEl("p", { text: t("settings.batch.guide.intro") });
  renderList(body, t, [
    "settings.batch.guide.step.scope",
    "settings.batch.guide.step.preview",
    "settings.batch.guide.step.recover",
  ], true);
  body.createEl("p", { text: t("settings.batch.guide.safety") });
  body.createEl("p", { text: t("settings.batch.guide.exclusions") });
}
