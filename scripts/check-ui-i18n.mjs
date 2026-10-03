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

process.stdout.write(`UI i18n contract passed for ${english.size} bilingual messages.\n`);
