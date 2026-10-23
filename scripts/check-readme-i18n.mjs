import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

const englishPath = "README.md";
const chinesePath = "docs/i18n/README.zh-CN.md";
const sections = [
  "screenshots",
  "features",
  "requirements-and-compatibility",
  "installation",
  "usage",
  "settings",
  "limitations",
  "privacy-and-security",
  "development",
  "support",
  "license",
];
const [english, chinese] = await Promise.all([readFile(englishPath, "utf8"), readFile(chinesePath, "utf8")]);


function sectionShapes(source, file) {
  const shapes = new Map();
  let section = "preamble";
  let fenced = false;
  const shape = () => {
    if (!shapes.has(section)) {
      shapes.set(section, {
        headings: [],
        bullets: 0,
        numbered: 0,
        tables: 0,
        fences: 0,
      });
    }
    return shapes.get(section);
  };
  shape();
  for (const line of source.split("\n")) {
    const marker = /^<!-- section: ([a-z0-9-]+) -->$/u.exec(line);
    if (marker != null) {
      section = marker[1];
      shape();
      continue;
    }
    if (/^```/u.test(line)) {
      if (!fenced) shape().fences += 1;
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = /^(#{2,6})\s+/u.exec(line);
    if (heading != null) shape().headings.push(heading[1].length);
    if (/^-\s+/u.test(line)) shape().bullets += 1;
    if (/^\d+\.\s+/u.test(line)) shape().numbered += 1;
    if (/^\|.*\|\s*$/u.test(line)) shape().tables += 1;
  }
  assert.equal(fenced, false, `${file} must not contain an unclosed fenced code block`);
  return Object.fromEntries(shapes);
}

function sectionMarkers(source, file) {
  const markers = [...source.matchAll(/<!-- section: ([a-z0-9-]+) -->/gu)].map((match) => match[1]);
  assert.deepEqual(markers, sections, `${file} must contain the canonical README sections in order`);
  return markers;
}

sectionMarkers(english, englishPath);
sectionMarkers(chinese, chinesePath);
assert.deepEqual(
  sectionShapes(chinese, chinesePath),
  sectionShapes(english, englishPath),
  "README translations must keep the same per-section Markdown structure",
);
const editions = [{"label":"English","path":"README.md"},{"label":"简体中文","path":"docs/i18n/README.zh-CN.md"},{"label":"繁體中文","path":"docs/i18n/README.zh-TW.md"},{"label":"日本語","path":"docs/i18n/README.ja.md"},{"label":"한국어","path":"docs/i18n/README.ko.md"},{"label":"Deutsch","path":"docs/i18n/README.de.md"},{"label":"Français","path":"docs/i18n/README.fr.md"},{"label":"Español","path":"docs/i18n/README.es.md"},{"label":"Português (Brasil)","path":"docs/i18n/README.pt-BR.md"},{"label":"Русский","path":"docs/i18n/README.ru.md"},{"label":"Tiếng Việt","path":"docs/i18n/README.vi.md"},{"label":"العربية","path":"docs/i18n/README.ar.md"}];
function editionLinks(filePath) {
  return editions.map(({label,path}) => {
    const href = filePath === "README.md" ? `https://github.com/ZHYX91/obsidian-number-suite/blob/main/${path}` : path === "README.md" ? "../../README.md" : path.slice("docs/i18n/".length);
    return `[${label}](${href})`;
  }).join(" · ");
}
async function validateReadmeTargets(filePath, source) {
  const repository = "ZHYX91/obsidian-number-suite";
  const blobPrefix = `https://github.com/${repository}/blob/main/`;
  const rawPrefix = `https://raw.githubusercontent.com/${repository}/main/`;
  const visible = source.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gmu, "").replace(/`[^`\n]*`/gu, "");
  for (const match of visible.matchAll(/(!?)\[[^\]]*\]\(([^)\s]+)\)/gu)) {
    const [ , image, target] = match;
    if (target.startsWith("#")) continue;
    let repositoryPath;
    const prefix = target.startsWith(blobPrefix) ? blobPrefix : target.startsWith(rawPrefix) ? rawPrefix : null;
    if (prefix !== null) {
      assert.equal(filePath, "README.md", `${filePath}: repository links must be relative`);
      assert.equal(prefix, image === "!" ? rawPrefix : blobPrefix, `${filePath}: use canonical image/document URLs`);
      repositoryPath = resolve(target.slice(prefix.length).split(/[?#]/u)[0]);
    } else if (/^[a-z][a-z0-9+.-]*:/iu.test(target)) {
      continue;
    } else {
      assert.notEqual(filePath, "README.md", "Root README links must work in the Obsidian catalog");
      repositoryPath = resolve(dirname(filePath), decodeURIComponent(target.split(/[?#]/u)[0]));
    }
    const inside = relative(process.cwd(), repositoryPath);
    assert.ok(!isAbsolute(inside) && inside !== ".." && !inside.startsWith("../"), `${filePath}: target leaves the repository: ${target}`);
    await access(repositoryPath);
  }
}

for (const {path} of editions) {
  const content = await readFile(path, "utf8");
  assert.match(content, /^# Number Suite\n/u, `${path} must begin with its title`);
  assert.equal(content.split("\n")[2], editionLinks(path), `${path} must link to every README language`);
  assert.match(content, /^## /mu, `${path} must contain usable instructions`);
  await validateReadmeTargets(path, content);
}
for (const { path } of editions.slice(2)) {
  const locale = /README\.([^.]+)\.md$/u.exec(path)?.[1];
  assert.ok(locale, `${path}: cannot identify README locale`);
  const catalog = await readFile(`src/config/locales/${locale}.ts`, "utf8");
  const match = /^\s*"settings\.showVirtual":\s*"((?:\\.|[^"\\])*)",?$/mu.exec(catalog);
  assert.ok(match, `${locale}: missing setting label for the README quick start`);
  const settingLabel = JSON.parse(`"${match[1]}"`);
  const source = await readFile(path, "utf8");
  assert.deepEqual(
    [...source.matchAll(/<!-- section: ([a-z0-9-]+) -->/gu)].map((match) => match[1]),
    ["installation", "quick-start", "captions", "numbering", "settings", "limitations", "privacy-and-support"],
    `${path}: localized guides must cover installation, everyday use, settings, limitations and help`,
  );
  for (const token of ["`main.js`", "`manifest.json`", "`styles.css`", "@[[", "Structural Tables", "H7", "Properties"]) {
    assert.ok(source.includes(token), `${path}: missing practical workflow information: ${token}`);
  }
  for (const advancedPath of ["../advanced.en.md", "../advanced.zh-CN.md"]) {
    assert.ok(source.includes(`](${advancedPath})`),
      `${path}: compact guide must identify its advanced-language reference`);
  }
  assert.ok(source.includes(settingLabel), `${path}: quick start must use the actual localized control label`);
  assert.doesNotMatch(source, /`Show virtual numbers`/u, `${path}: stale English-only button label`);
}
for (const file of ["docs/advanced.en.md", "docs/advanced.zh-CN.md"]) {
  const content = await readFile(file, "utf8");
  for (const syntax of ["H7", "Figure:", "Table:", "Equation:", "Code:", "@[[", "[^endnote:id]"]) {
    assert.ok(content.includes(syntax), `${file}: missing detailed syntax: ${syntax}`);
  }
  await validateReadmeTargets(file, content);
}
assert.ok(english.includes("blob/main/docs/advanced.en.md"),
  "Root README must direct advanced users to the full reference");
assert.ok(chinese.includes("](../advanced.zh-CN.md)"),
  "Chinese README must link to its advanced reference");

assert.doesNotMatch(english, /Choose from 12 interface languages/u);
assert.doesNotMatch(chinese, /使用英文或简体中文界面/u);
assert.match(english, /## Features/u, "Root README must be the English canonical document");
assert.match(chinese, /## 功能/u, "Chinese README must contain translated content");
for (const [file, source] of [[englishPath, english], [chinesePath, chinese]]) {
  assert.doesNotMatch(source, /(?:[A-Za-z]:\\|OneDrive|Obsidian-Plugins|obsidian-plugin-workspace)/u,
    `${file} must not contain local or workspace-only paths`);
}

process.stdout.write(`README i18n contract passed for ${sections.length} synchronized sections.\n`);
