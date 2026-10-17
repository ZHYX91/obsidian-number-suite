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
  assert.deepEqual([...translated.keys()].sort(), [...english.keys()].sort(),
    `${locale}: missing or unexpected UI translation keys`);
}

process.stdout.write(`UI i18n contract passed for ${english.size} EN/zh-CN messages and ten locale catalogs.\n`);
