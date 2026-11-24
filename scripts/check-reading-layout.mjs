import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";


const temp = await mkdtemp(join(tmpdir(), "number-suite-layout-"));
try {
  await build({
    entryPoints: ["scripts/browser/reading-layout.mjs"], bundle: true, platform: "browser",
    alias: { obsidian: resolve("tests/mocks/obsidian.ts") }, outfile: join(temp, "fixture.js"),
  });
  await copyFile("styles.css", join(temp, "styles.css"));
  const html = join(temp, "index.html");
  await writeFile(html, '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><body><script src="fixture.js"></script></body>');
  const browser = await chromium.launch(process.env.CHROME_BIN
    ? { executablePath: process.env.CHROME_BIN }
    : { channel: "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 320 } });
    await page.goto(pathToFileURL(html).href);
    await page.evaluate(() => window.verifyReadingLayout());
  } finally {
    await browser.close();
  }
  console.log("Reading layout passed for LTR and RTL captions and a scrollable keyboard tooltip.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
