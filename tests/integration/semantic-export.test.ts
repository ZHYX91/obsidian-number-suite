import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../../src/config/settings";
import {
  exportSemanticSnapshotV2,
  NUMBER_SUITE_INTEROP_SCHEMA_V2,
} from "../../src/integration/semantic-export";

describe("Number Suite interoperability snapshot", () => {
  it("exports virtual headings, captions, and resolved references without mutating source", () => {
    const source = [
      "# Scope ^scope",
      "",
      "Table: Results ^results",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "See @[[#^scope|section]] and @[[#^results|table]].",
    ].join("\r\n");
    const snapshot = exportSemanticSnapshotV2(
      {
        ...DEFAULT_SETTINGS,
        selectedSchemeId: "hierarchical",
        showVirtualNumbers: true,
      },
      {
        schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
        authoredMarkdown: source,
        frontmatter: null,
      },
    );

    expect(snapshot).toMatchObject({
      schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
      offsetEncoding: "utf16",
      disabled: false,
    });
    expect(snapshot.headingTargets[0]).toMatchObject({
      targetId: "scope",
      authoredText: "Scope",
      enabled: true,
      derivedNumber: "1",
    });
    expect(snapshot.captionTargets[0]).toMatchObject({
      kind: "Table",
      targetId: "results",
      authoredText: "Results",
      enabled: true,
      derivedNumber: "1",
    });
    expect(snapshot.references).toHaveLength(2);
    expect(source).toContain("@[[#^scope|section]]");
  });

  it("fails closed to disabled targets for an ignored note", () => {
    const snapshot = exportSemanticSnapshotV2(DEFAULT_SETTINGS, {
      schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
      authoredMarkdown: "# Hidden\n\nFigure: One\n![one](one.png)",
      frontmatter: { "number-suite-ignore": true },
    });

    expect(snapshot.disabled).toBe(true);
    expect(snapshot.headingTargets).toEqual([]);
    expect(snapshot.captionTargets).toEqual([]);
    expect(snapshot.references).toEqual([]);
  });

  it("exports all four caption kinds with whole-line UTF-16 ranges and permits ID-only text", () => {
    const lines = [
      "Intro 🐈",
      "Figure: Cat 🐈 ^figure-id",
      "![[cat.png]]",
      "Table: Results",
      "| A |",
      "| --- |",
      "Equation: ^energy",
      "$$E=mc^2$$",
      "Code: ^snippet",
      "```ts",
      "const answer = 42;",
      "```",
    ];
    const source = lines.join("\r\n");
    const snapshot = exportSemanticSnapshotV2(DEFAULT_SETTINGS, {
      schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
      authoredMarkdown: source,
      frontmatter: null,
    });

    expect(snapshot.captionTargets.map((target) => ({
      kind: target.kind,
      targetId: target.targetId,
      authoredText: target.authoredText,
      derivedNumber: target.derivedNumber,
      source: source.slice(target.sourceStartUtf16, target.sourceEndUtf16),
    }))).toEqual([
      {
        kind: "Figure",
        targetId: "figure-id",
        authoredText: "Cat 🐈",
        derivedNumber: "1",
        source: "Figure: Cat 🐈 ^figure-id",
      },
      {
        kind: "Table",
        targetId: null,
        authoredText: "Results",
        derivedNumber: "1",
        source: "Table: Results",
      },
      {
        kind: "Equation",
        targetId: "energy",
        authoredText: "",
        derivedNumber: "1",
        source: "Equation: ^energy",
      },
      {
        kind: "Code",
        targetId: "snippet",
        authoredText: "",
        derivedNumber: "1",
        source: "Code: ^snippet",
      },
    ]);
    expect(snapshot.captionTargets[0]?.sourceStartUtf16).toBe(source.indexOf(lines[1] ?? ""));
  });

  it("exports a unique following block ID as target identity", () => {
    const source = [
      "# Scope",
      "^Scope-ID",
      "",
      "Equation: Energy",
      "^Energy-ID",
      "",
      "See @[[#^Scope-ID|section]] and @[[#^Energy-ID|equation]].",
    ].join("\r\n");
    const snapshot = exportSemanticSnapshotV2(
      { ...DEFAULT_SETTINGS, selectedSchemeId: "hierarchical", showVirtualNumbers: true },
      {
        schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
        authoredMarkdown: source,
        frontmatter: null,
      },
    );

    expect(snapshot.headingTargets[0]?.targetId).toBe("Scope-ID");
    expect(snapshot.captionTargets[0]?.targetId).toBe("Energy-ID");
    expect(snapshot.references).toHaveLength(2);
  });

  it("preserves exact reference ranges, trims aliases, and omits ambiguous targets", () => {
    const uniqueHeading = "# Unique 🐈 ^unique";
    const uniqueReference = "@[[#Unique 🐈|  section  ]]";
    const ambiguousReference = "@[[#Figure: Repeated]]";
    const duplicateIdReference = "@[[#^duplicate]]";
    const source = [
      uniqueHeading,
      "# Figure: Repeated",
      "Figure: Repeated",
      "# One ^duplicate",
      "# Two ^duplicate",
      `See ${uniqueReference}, ${ambiguousReference}, and ${duplicateIdReference}.`,
    ].join("\n");
    const snapshot = exportSemanticSnapshotV2(
      { ...DEFAULT_SETTINGS, selectedSchemeId: "hierarchical", showVirtualNumbers: true },
      {
        schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
        authoredMarkdown: source,
        frontmatter: null,
      },
    );

    expect(snapshot.references).toHaveLength(1);
    const reference = snapshot.references[0];
    expect(reference).toBeDefined();
    expect(source.slice(reference?.sourceStartUtf16, reference?.sourceEndUtf16)).toBe(uniqueReference);
    expect(reference?.alias).toBe("section");
    expect(source.slice(reference?.targetSourceStartUtf16, reference?.targetSourceEndUtf16)).toBe(uniqueHeading);
    expect(snapshot.headingTargets.filter((target) => target.authoredText === "One" || target.authoredText === "Two")
      .every((target) => target.targetId === null)).toBe(true);
  });

  it("exports current-only numbering as one effective counter segment", () => {
    const snapshot = exportSemanticSnapshotV2(
      {
        ...DEFAULT_SETTINGS,
        selectedSchemeId: "hierarchical",
        showVirtualNumbers: true,
        missingLevelStrategy: "current-only",
      },
      {
        schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
        authoredMarkdown: "### Deep",
        frontmatter: null,
      },
    );

    expect(snapshot.headingTargets[0]).toMatchObject({
      derivedNumber: "1",
      display: [{ kind: "counter", level: 3, numberFormat: "arabic" }],
    });
  });

  it("exports an H9 target with nine counters and resolves its stable block ID", () => {
    const source = "######### Deep ^deep\n\nSee @[[#^deep|deep]].";
    const snapshot = exportSemanticSnapshotV2(
      {
        ...DEFAULT_SETTINGS,
        selectedSchemeId: "hierarchical",
        showVirtualNumbers: true,
      },
      {
        schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
        authoredMarkdown: source,
        frontmatter: null,
      },
    );

    expect(snapshot.headingTargets[0]).toMatchObject({
      level: 9,
      targetId: "deep",
      authoredText: "Deep",
      enabled: true,
      derivedNumber: "1.1.1.1.1.1.1.1.1",
    });
    expect(snapshot.headingTargets[0]?.counters).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(snapshot.references).toHaveLength(1);
  });

  it("exports H1 through H9 with nine counters and valid display topology", () => {
    const source = Array.from({ length: 9 }, (_unused, index) => (
      `${"#".repeat(index + 1)} Level ${index + 1}`
    )).join("\n");
    const snapshot = exportSemanticSnapshotV2(
      { ...DEFAULT_SETTINGS, selectedSchemeId: "hierarchical", showVirtualNumbers: true },
      {
        schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
        authoredMarkdown: source,
        frontmatter: null,
      },
    );

    expect(snapshot.headingTargets.map((target) => target.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const target of snapshot.headingTargets) {
      expect(target.counters).toHaveLength(9);
      expect(target.display.filter((segment) => segment.kind === "counter" && segment.level === target.level))
        .toHaveLength(1);
      expect(target.display.some((segment) => segment.kind === "counter" && segment.level > target.level))
        .toBe(false);
    }
  });

  it("preserves consumer-neutral long and percent literals", () => {
    const literal = `Percent% ${"x".repeat(40)} `;
    const snapshot = exportSemanticSnapshotV2(
      {
        ...DEFAULT_SETTINGS,
        selectedSchemeId: "custom-long-literal",
        showVirtualNumbers: true,
        customSchemes: [{
          id: "custom-long-literal",
          name: "Long literal",
          revision: 1,
          baseLevel: 1,
          templates: [
            `${literal}{1.arabic}`,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
          ],
          exclusions: [],
        }],
      },
      {
        schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
        authoredMarkdown: "# Heading",
        frontmatter: null,
      },
    );

    expect(literal.length).toBeGreaterThan(32);
    expect(snapshot.headingTargets[0]).toMatchObject({
      enabled: true,
      derivedNumber: `${literal}1`,
      display: [
        { kind: "literal", literal },
        { kind: "counter", level: 1, numberFormat: "arabic" },
      ],
    });
  });

  it("keeps visual caption placement out of the source snapshot and does not invent IDs", () => {
    const source = "Figure: Miao\n\n![[Miao.png]]";
    const above = exportSemanticSnapshotV2(DEFAULT_SETTINGS, {
      schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
      authoredMarkdown: source,
      frontmatter: null,
    });
    const below = exportSemanticSnapshotV2({
      ...DEFAULT_SETTINGS,
      figureCaptionPlacement: "below",
      tableCaptionPlacement: "below",
      equationCaptionPlacement: "below",
      codeCaptionPlacement: "below",
      showImageCaptionTooltips: false,
    }, {
      schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
      authoredMarkdown: source,
      frontmatter: null,
    });

    expect(below).toEqual(above);
    expect(below.captionTargets[0]).toMatchObject({
      targetId: null,
      authoredText: "Miao",
    });
  });

  it("does not claim lossless materialization when a stored prefix must be concealed", () => {
    const snapshot = exportSemanticSnapshotV2(
      {
        ...DEFAULT_SETTINGS,
        showVirtualNumbers: true,
        concealStoredNumbers: true,
      },
      {
        schema: NUMBER_SUITE_INTEROP_SCHEMA_V2,
        authoredMarkdown: "# 1. Stored title",
        frontmatter: null,
      },
    );

    expect(snapshot.headingTargets[0]).toMatchObject({
      enabled: false,
      derivedNumber: null,
      display: [],
    });
  });
});
