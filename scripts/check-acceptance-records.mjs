import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const directory = "docs/acceptance";
const ignored = new Set(["README.md", "TEMPLATE.md"]);
const required = [
  "Plugin commit:",
  "Artifact SHA-256:",
  "Plugin version:",
  "Obsidian version:",
  "Operating system or device:",
  "Vault type:",
  "Theme:",
  "Automated gate:",
  "Manual cases passed:",
  "Known limitations:",
  "Accepted by/date:",
];

const files = (await readdir(directory))
  .filter((name) => name.endsWith(".md") && !ignored.has(name))
  .sort();

for (const name of files) {
  assert.match(name, /^\d+\.\d+\.\d+-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.md$/u,
    `${name} must use <version>-<surface>-YYYY-MM-DD.md`);
  const source = await readFile(`${directory}/${name}`, "utf8");
  for (const field of required) {
    const line = source.split("\n").find((candidate) => candidate.startsWith(field));
    assert.ok(line != null, `${name} is missing ${field}`);
    assert.ok(line.slice(field.length).trim().length > 0, `${name} has an empty ${field}`);
  }
}

process.stdout.write(`Acceptance-record contract passed for ${files.length} evidence files.\n`);
