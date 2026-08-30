import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();

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

for (const staticFile of ["manifest.json", "styles.css"]) {
  const [source, built] = await Promise.all([
    readFile(path.join(root, staticFile)),
    readFile(path.join(root, "dist", staticFile)),
  ]);
  if (!source.equals(built)) {
    throw new Error(`dist/${staticFile} is stale.`);
  }
}

const bundle = await readFile(path.join(root, "dist", "main.js"), "utf8");
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
  ItemView: HostClass,
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
const commonJsModule = { exports: {} };
vm.runInNewContext(bundle, {
  clearTimeout,
  console,
  exports: commonJsModule.exports,
  module: commonJsModule,
  require: (specifier) => specifier === "obsidian" ? obsidianStub : nativeRequire(specifier),
  setTimeout,
}, { filename: "dist/main.js", timeout: 5_000 });
if (typeof commonJsModule.exports?.default !== "function") {
  throw new Error("Production bundle did not expose a default plugin class.");
}

process.stdout.write(
  `Production bundle contract passed for Number Suite; bundle=${Buffer.byteLength(bundle)} bytes.\n`,
);
