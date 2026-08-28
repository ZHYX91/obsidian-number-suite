import { readFile, readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";

const root = process.cwd();
const dist = path.join(root, "dist");
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const [packageJson, lock, manifest, versions] = await Promise.all([
  readJson("package.json"),
  readJson("package-lock.json"),
  readJson("manifest.json"),
  readJson("versions.json"),
]);

const version = packageJson.version;
if (manifest.version !== version || lock.version !== version || lock.packages?.[""]?.version !== version) {
  throw new Error("package.json, package-lock.json, and manifest.json versions must match.");
}
if (versions[version] !== manifest.minAppVersion) {
  throw new Error("versions.json must map the current version to manifest.minAppVersion.");
}
if (manifest.id !== "number-suite" || manifest.name !== "Number Suite") {
  throw new Error("Manifest identity changed unexpectedly.");
}
if (manifest.isDesktopOnly !== false) {
  throw new Error("Number Suite releases must remain available on mobile Obsidian.");
}
const mobileContractFiles = [
  ["README.md", "Desktop and Android Obsidian"],
  ["docs/i18n/README.zh-CN.md", "支持桌面版和 Android 版 Obsidian"],
  ["docs/ACCEPTANCE.md", "Android 15 / API 35 emulator"],
];
for (const [relativePath, requiredText] of mobileContractFiles) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  if (!source.includes(requiredText)) {
    throw new Error(`${relativePath} is missing the mobile support contract: ${requiredText}`);
  }
}

const expectedFiles = ["main.js", "manifest.json", "styles.css"];
const actualFiles = (await readdir(dist)).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify([...expectedFiles].sort())) {
  throw new Error(`dist must contain exactly ${expectedFiles.join(", ")}; received ${actualFiles.join(", ")}`);
}
for (const name of expectedFiles) {
  const info = await stat(path.join(dist, name));
  if (!info.isFile() || info.size === 0) {
    throw new Error(`dist/${name} is missing or empty.`);
  }
}
for (const staticFile of ["manifest.json", "styles.css"]) {
  const [source, built] = await Promise.all([
    readFile(path.join(root, staticFile)),
    readFile(path.join(dist, staticFile)),
  ]);
  if (!source.equals(built)) {
    throw new Error(`dist/${staticFile} is stale.`);
  }
}

const bundle = await readFile(path.join(dist, "main.js"), "utf8");
if (Buffer.byteLength(bundle) > 1_500_000) {
  throw new Error("Production bundle exceeds the 1.5 MB release budget.");
}
if (bundle.includes("sourceMappingURL=") || bundle.includes("D:\\Projects\\")) {
  throw new Error("Production bundle contains development-only source metadata.");
}
for (const external of ["obsidian", "@codemirror/language", "@codemirror/state", "@codemirror/view"]) {
  if (!bundle.includes(`require("${external}")`)) {
    throw new Error(`Expected runtime external was not preserved: ${external}`);
  }
}

const HostClass = class {};
const obsidianStub = {
  App: HostClass,
  FuzzySuggestModal: HostClass,
  MarkdownView: HostClass,
  Menu: HostClass,
  Modal: HostClass,
  Notice: HostClass,
  Plugin: HostClass,
  PluginSettingTab: HostClass,
  Setting: HostClass,
  TFile: HostClass,
  TFolder: HostClass,
  editorInfoField: {},
  editorLivePreviewField: {},
  getFrontMatterInfo: () => ({ exists: false, frontmatter: "", from: 0, to: 0, contentStart: 0 }),
  getLanguage: () => "en",
  normalizePath: (value) => value,
  parseYaml: () => null,
};
const nativeRequire = createRequire(import.meta.url);
const cjsModule = { exports: {} };
vm.runInNewContext(bundle, {
  clearTimeout,
  console,
  exports: cjsModule.exports,
  module: cjsModule,
  require: (specifier) => specifier === "obsidian" ? obsidianStub : nativeRequire(specifier),
  setTimeout,
}, { filename: "dist/main.js", timeout: 5_000 });
const pluginExport = cjsModule.exports?.default;
if (typeof pluginExport !== "function") {
  throw new Error("Production bundle did not expose a default plugin class.");
}

process.stdout.write(`Release contract passed for Number Suite ${version}; bundle=${Buffer.byteLength(bundle)} bytes.\n`);
