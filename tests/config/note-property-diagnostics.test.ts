import { describe, expect, it } from "vitest";

import {
  invalidNoteOverrides,
  parseNoteOverrides,
  resolveNoteSettings,
  type NotePropertyIssue,
} from "../../src/config/frontmatter";
import { notePropertySourceIssues } from "../../src/config/frontmatter-source";
import { createTranslator } from "../../src/config/i18n";
import { UI_LOCALES } from "../../src/config/language-options";
import { NUMBER_SUITE_LOCALE_OVERRIDES } from "../../src/config/locale-overrides";
import { DEFAULT_SETTINGS } from "../../src/config/settings";
import { notePropertyIssueText } from "../../src/ui/note-property-diagnostics";

interface DiagnosticExample {
  readonly name: string;
  readonly read: () => readonly NotePropertyIssue[];
  readonly code: NotePropertyIssue["code"];
  readonly details: NotePropertyIssue["details"];
  readonly message: string;
}

const examples: DiagnosticExample[] = [
  {
    name: "canonical list type",
    read: () => parseNoteOverrides({ "number-suite": "heading.virtual=true" }).issues,
    code: "canonical-type", details: { kind: "canonical-type" },
    message: "number-suite must be a list of path=value text items",
  },
  ...[false, " heading.virtual=true "].map((item): DiagnosticExample => ({
    name: `non-text or padded item: ${String(item)}`,
    read: () => parseNoteOverrides({ "number-suite": [item] }).issues,
    code: "malformed-directive", details: { kind: "malformed-item" },
    message: "number-suite contains a non-text or padded item",
  })),
  {
    name: "malformed item syntax",
    read: () => parseNoteOverrides({ "number-suite": ["heading.virtual"] }).issues,
    code: "malformed-directive", details: { kind: "invalid-item", item: "heading.virtual" },
    message: "Invalid number-suite item: heading.virtual",
  },
  {
    name: "unknown directive",
    read: () => parseNoteOverrides({ "number-suite": ["heading.unrecognized=true"] }).issues,
    code: "unknown-directive", details: { kind: "unknown-directive", key: "heading.unrecognized" },
    message: "Unknown number-suite directive: heading.unrecognized",
  },
  {
    name: "duplicate directive",
    read: () => parseNoteOverrides({ "number-suite": ["heading.virtual=true", "heading.virtual=false"] }).issues,
    code: "duplicate-directive", details: { kind: "duplicate-directive", key: "heading.virtual" },
    message: "Duplicate number-suite directive: heading.virtual",
  },
  ...[
    "disabled=maybe", "heading.virtual=maybe", "heading.hide-stored=maybe", "heading.scheme=UPPER CASE",
    "heading.first-number.h0=1", "heading.skip-first.h0=1", "heading.first-number.h1=0",
    "heading.skip-first.h1=-1", "heading.first-number.h9=9007199254740992", "heading.skip-first.h9=9007199254740992",
    "heading.skip-per-parent.h1=0", "heading.skip-per-parent.h10=1", "heading.skip-per-parent.h2=-1",
    "heading.skip-per-parent.h9=9007199254740992",
  ].map((item): DiagnosticExample => ({
    name: `invalid value: ${item}`,
    read: () => parseNoteOverrides({ "number-suite": [item] }).issues,
    code: "invalid-value", details: { kind: "invalid-item", item },
    message: `Invalid number-suite item: ${item}`,
  })),
  ...[
    ["number-suite-ignore", "true"], ["number-suite-show-virtual", "false"],
    ["number-suite-conceal-stored", 1], ["number-suite-scheme", "UPPER CASE"],
    ["number-suite-start", 0],
  ].map(([key, value]): DiagnosticExample => ({
    name: `legacy type: ${String(key)}`,
    read: () => parseNoteOverrides({ [String(key)]: value }).issues,
    code: "legacy-type", details: { kind: "legacy-type", key: String(key) },
    message: `Invalid legacy property ${String(key)}`,
  })),
  {
    name: "legacy start level",
    read: () => parseNoteOverrides({ "number-suite-start": { h9: 0 } }).issues,
    code: "legacy-type", details: { kind: "legacy-type", key: "number-suite-start.h9" },
    message: "Invalid legacy property number-suite-start.h9",
  },
  ...[
    { field: "disabled", item: "disabled=true", key: "number-suite-ignore", value: false },
    { field: "heading.virtual", item: "heading.virtual=true", key: "number-suite-show-virtual", value: false },
    { field: "heading.hide-stored", item: "heading.hide-stored=true", key: "number-suite-conceal-stored", value: false },
    { field: "heading.scheme", item: "heading.scheme=legal", key: "number-suite-scheme", value: "decimal" },
    { field: "heading.first-number", item: "heading.first-number.h9=2", key: "number-suite-start", value: { h9: 3 } },
  ].map(({ field, item, key, value }): DiagnosticExample => ({
    name: `conflict: ${field}`,
    read: () => parseNoteOverrides({ "number-suite": [item], [key]: value }).issues,
    code: "conflict", details: { kind: "conflict", legacyKey: key },
    message: `Conflicting ${field} values in number-suite and ${key}`,
  })),
  {
    name: "unavailable scheme",
    read: () => resolveNoteSettings(DEFAULT_SETTINGS, parseNoteOverrides({ "number-suite": ["heading.scheme=missing-user-scheme"] })).issues,
    code: "unavailable-scheme", details: { kind: "unavailable-scheme", schemeId: "missing-user-scheme" },
    message: "Unavailable Number Suite scheme: missing-user-scheme",
  },
  ...["'number-suite'", '"number-suite-scheme"'].map((quoted): DiagnosticExample => {
    const key = quoted.slice(1, -1);
    return {
      name: `quoted source key: ${quoted}`,
      read: () => notePropertySourceIssues(`${quoted}: []`),
      code: "source-ambiguous", details: { kind: "source-quoted-key", key },
      message: `Quoted Number Suite property key requires manual review: ${key}`,
    };
  }),
  ...["number-suite", "number-suite-start"].map((key): DiagnosticExample => ({
    name: `duplicate source key: ${key}`,
    read: () => notePropertySourceIssues(`${key}: []\n${key}: []`),
    code: "source-ambiguous", details: { kind: "source-duplicate-key", key },
    message: `Duplicate Number Suite property key requires manual review: ${key}`,
  })),
  {
    name: "invalid Properties YAML",
    read: () => invalidNoteOverrides().issues,
    code: "source-ambiguous", details: { kind: "source-invalid-yaml" },
    message: "Invalid Properties YAML",
  },
];

const diagnosticKeys = [
  "canonical-type", "malformed-item", "invalid-item", "unknown-directive", "duplicate-directive",
  "legacy-type", "conflict", "unavailable-scheme", "source-quoted-key", "source-duplicate-key", "source-invalid-yaml",
] as const;

describe("structured Properties diagnostics", () => {
  it.each(examples)("preserves the stable message and parameters for $name", (example) => {
    const issues = example.read();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: example.code, details: example.details, message: example.message });
    expect(notePropertyIssueText(issues[0]!, createTranslator("en"))).toBe(example.message);
  });

  it.each(UI_LOCALES)("localizes every diagnostic variant in %s without parsing its message", (locale) => {
    const t = createTranslator(locale);
    for (const example of examples) {
      const issue = example.read()[0]!;
      const result = notePropertyIssueText({ ...issue, message: "Not UI text" }, t);
      expect(result).not.toContain("Not UI text");
      expect(result).not.toMatch(/\{(?:property|item|key|field|legacyKey|scheme)\}/u);
      if (locale === "en") expect(result).toBe(example.message);
      else expect(result).not.toBe(example.message);
      for (const [key, value] of Object.entries(issue.details)) {
        if (key !== "kind") expect(result).toContain(value);
      }
      if (issue.code === "conflict") expect(result).toContain(issue.field);
    }
    for (const kind of diagnosticKeys) {
      const key = `panel.properties.issue.${kind}` as const;
      const english = createTranslator("en")(key);
      const placeholders = (value: string) => [...value.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]).sort();
      expect(placeholders(t(key))).toEqual(placeholders(english));
      if (locale !== "en" && locale !== "zh") {
        expect(Object.prototype.hasOwnProperty.call(NUMBER_SUITE_LOCALE_OVERRIDES[locale], key)).toBe(true);
      }
    }
  });

  it("keeps custom non-UI error messages separate from localized YAML details", () => {
    const issue = invalidNoteOverrides("Original parser diagnostic").issues[0]!;
    expect(issue.message).toBe("Original parser diagnostic");
    expect(notePropertyIssueText(issue, createTranslator("zh"))).toBe("属性 YAML 无效");
  });

  it("preserves literal replacement tokens and markup in every locale", () => {
    const item = "heading.virtual=<b>原值</b> $& $` $' $$ {key}";
    const issue = parseNoteOverrides({ "number-suite": [item] }).issues[0]!;
    for (const locale of UI_LOCALES) expect(notePropertyIssueText(issue, createTranslator(locale))).toContain(item);
  });

  it("covers all issue codes and leaves valid overrides unchanged", () => {
    expect(new Set(examples.map(({ code }) => code))).toEqual(new Set([
      "canonical-type", "malformed-directive", "unknown-directive", "duplicate-directive", "invalid-value",
      "legacy-type", "conflict", "unavailable-scheme", "source-ambiguous",
    ]));
    const raw = { "number-suite": ["heading.virtual=true", "heading.first-number.h9=2", "heading.skip-first.h1=0"],
      "number-suite-show-virtual": true };
    const before = structuredClone(raw);
    expect(resolveNoteSettings(DEFAULT_SETTINGS, parseNoteOverrides(raw)).issues).toEqual([]);
    expect(raw).toEqual(before);
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9])("resolves both skip scopes at H%s without writing Properties", (level) => {
    const property = Object.freeze([`heading.skip-per-parent.h${level}=0`, `heading.skip-first.h${level}=3`]);
    const raw = Object.freeze({ "number-suite": property });
    expect(resolveNoteSettings(DEFAULT_SETTINGS, parseNoteOverrides(raw))).toMatchObject({
      valid: true, skipFirst: { [level]: 3 }, skipPerParent: { [level]: 0 },
    });
    expect(raw["number-suite"]).toBe(property);
  });
});
