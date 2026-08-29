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
    ].join("\n");
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
    expect(snapshot.captionTargets.every((target) => !target.enabled)).toBe(true);
    expect(snapshot.references).toEqual([]);
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
