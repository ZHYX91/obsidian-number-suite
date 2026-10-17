import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const path = "src/config/i18n.ts";
const source = await readFile(path, "utf8");

function messageBlock(name, nextName) {
  const start = source.indexOf(`const ${name}`);
  const end = source.indexOf(`const ${nextName}`, start);
  assert.ok(start >= 0 && end > start, `${path} must contain ${name} before ${nextName}`);
  return source.slice(start, end);
}

function messages(block, name) {
  const entries = [...block.matchAll(/^\s*"([^"]+)":\s*"((?:\\.|[^"\\])*)",?\s*$/gmu)];
  assert.ok(entries.length > 0, `${name} must contain localized messages`);
  const keys = entries.map((match) => match[1]);
  assert.equal(new Set(keys).size, keys.length, `${name} must not contain duplicate message keys`);
  return new Map(entries.map((match) => [match[1], match[2]]));
}

function placeholders(value) {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/gu)].map((match) => match[1]).sort();
}

const english = messages(messageBlock("EN", "ZH"), "EN");
const chineseStart = source.indexOf("const ZH");
const chineseEnd = source.indexOf("export type Translate", chineseStart);
assert.ok(chineseStart >= 0 && chineseEnd > chineseStart, `${path} must contain ZH before Translate`);
const chinese = messages(source.slice(chineseStart, chineseEnd), "ZH");

assert.deepEqual([...chinese.keys()].sort(), [...english.keys()].sort(),
  "English and Chinese UI message keys must match");

for (const [key, englishValue] of english) {
  const chineseValue = chinese.get(key);
  assert.ok(chineseValue != null, `Missing Chinese message for ${key}`);
  assert.deepEqual(
    placeholders(chineseValue),
    placeholders(englishValue),
    `Interpolation placeholders must match for ${key}`,
  );
}


const localeNames = ["zh-TW", "ja", "ko", "de", "fr", "es", "pt-BR", "ru", "vi", "ar"];
const languageOptions = await readFile("src/config/language-options.ts", "utf8");
const labelsStart = languageOptions.indexOf("export const UI_LOCALE_LABELS = {");
const labelsEnd = languageOptions.indexOf("} as const;", labelsStart);
assert.ok(labelsStart >= 0 && labelsEnd > labelsStart, "UI language options are missing");
const registeredLocales = [...languageOptions.slice(labelsStart, labelsEnd).matchAll(/^  "([^"]+)":/gmu)]
  .map((match) => match[1]);
assert.deepEqual(registeredLocales.sort(), ["en", "zh", ...localeNames].sort(),
  "Registered UI languages and translation catalogs must agree");
for (const locale of localeNames) {
  const localePath = `src/config/locales/${locale}.ts`;
  const translated = messages(await readFile(localePath, "utf8"), locale);
  for (const [key, value] of translated) {
    assert.ok(english.has(key), `${locale}: unknown UI key ${key}`);
    assert.deepEqual(placeholders(value), placeholders(english.get(key)),
      `${locale}: placeholder mismatch at ${key}`);
  }
  assert.deepEqual([...translated.keys()], [...english.keys()],
    `${locale}: UI keys must match the English catalog in content and order`);
  const sourceExamples = [
    "settings.captions.guide.example.source",
    "settings.references.guide.heading.source",
    "settings.references.guide.caption.source",
    "settings.notes.guide.footnote.source",
    "settings.notes.guide.endnote.source",
  ];
  for (const key of sourceExamples) {
    assert.ok(translated.get(key)?.includes("\\n"), `${locale}: missing Markdown example line breaks in ${key}`);
  }
  const captionExample = translated.get("settings.captions.guide.example.source");
  assert.ok(captionExample?.includes("Figure:") && captionExample.includes("Table:"),
    `${locale}: caption examples must keep fixed syntax keywords`);
  assert.ok(translated.get("settings.notes.guide.endnote.source")?.includes("[^endnote:later]"),
    `${locale}: endnote source marker must remain literal`);
  const decode = (key) => JSON.parse(`"${translated.get(key)}"`);
  const headingExample = decode("settings.references.guide.heading.source");
  const headingTitle = /^## (.+)\n/u.exec(headingExample)?.[1];
  assert.ok(headingTitle && headingExample.includes(`@[[#${headingTitle}|`),
    `${locale}: heading reference example must point to the shown heading`);
  const captionReference = decode("settings.references.guide.caption.source");
  const captionTitle = /^(Figure: .+)\n/u.exec(captionReference)?.[1];
  assert.ok(captionTitle && captionReference.includes(`@[[#${captionTitle}]]`),
    `${locale}: caption reference example must point to the shown caption`);
  assert.ok(decode("settings.notes.guide.footnote.source").includes("[^detail]:"),
    `${locale}: footnote definition must match its reference`);
  assert.ok(decode("settings.notes.guide.endnote.source").includes("[^endnote:later]:"),
    `${locale}: endnote definition must match its reference`);
}

process.stdout.write(`UI i18n contract passed for ${english.size} EN/zh-CN messages and ten locale catalogs.\n`);
