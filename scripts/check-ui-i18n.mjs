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


const localePath = "src/config/locale-overrides.ts";
const localeSource = await readFile(localePath, "utf8");
const localeNames = ["zh-TW", "ja", "ko", "de", "fr", "es", "pt-BR", "ru", "vi", "ar"];
const criticalKeys = [
  "command.mode.normal", "command.mode.show", "command.mode.conceal",
  "command.write.current", "command.remove.current", "command.renumber.current",
  "command.strip.current", "command.batch.folder", "command.batch.undo",
  "command.note.controls", "command.sidebar.outline", "command.headingMap.open",
  "notice.stalePreview", "notice.batchChanged", "notice.invalidProperties",
  "notice.noChanges", "notice.batchTooLarge", "notice.batchFailed",
  "preview.warningLinks", "preview.cleanupScope.desc",
  "preview.title.write", "preview.title.remove", "preview.title.renumber",
  "settings.scheme.suggestion", "settings.scheme.suggestion.desc",
  "settings.scheme.useSuggestion", "settings.language.partial",
];
for (let index = 0; index < localeNames.length; index += 1) {
  const locale = localeNames[index];
  const start = localeSource.indexOf(`  "${locale}": {`);
  const next = localeNames[index + 1];
  const end = next == null ? localeSource.length : localeSource.indexOf(`  "${next}": {`, start + 1);
  assert.ok(start >= 0 && end > start, `${localePath}: invalid locale block for ${locale}`);
  const translated = messages(localeSource.slice(start, end), locale);
  for (const [key, value] of translated) {
    assert.ok(english.has(key), `${locale}: unknown UI key ${key}`);
    assert.deepEqual(placeholders(value), placeholders(english.get(key)),
      `${locale}: placeholder mismatch at ${key}`);
  }
  if (locale === "zh-TW" || locale === "ar") {
    assert.deepEqual([...translated.keys()].sort(), [...english.keys()].sort(),
      `${locale} must translate every UI key`);
  } else {
    for (const key of criticalKeys) {
      assert.ok(translated.has(key), `${locale}: missing critical UI message ${key}`);
    }
  }
}

process.stdout.write(`UI i18n contract passed for ${english.size} EN/zh-CN messages and ten locale catalogs.\n`);
