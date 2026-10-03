import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("accepts stable docs and rejects version-specific acceptance prose", () => {
  const root = mkdtempSync(join(tmpdir(), "number-suite-docs-contract-"));
  try {
    mkdirSync(join(root, "docs"));
    for (const stem of ["product-requirements", "ux-spec", "architecture", "testing-strategy"]) {
      for (const language of ["en", "zh-CN"]) {
        const file = `${stem}.${language}.md`;
        copyFileSync(resolve("docs", file), join(root, "docs", file));
      }
    }
    const run = () => spawnSync(process.execPath, [resolve("scripts/check-docs-i18n.mjs")], {
      cwd: root, encoding: "utf8",
    });
    expect(run().status).toBe(0);
    const file = join(root, "docs", "testing-strategy.en.md");
    const original = readFileSync(file, "utf8");
    for (const version of ["0.7", "0.7.1"]) {
      writeFileSync(file, `${original}\nThe ${version} line additionally verifies captions.\n`);
      const result = run();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("must not encode version-line-specific acceptance policy");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
