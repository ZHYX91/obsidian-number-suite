import { describe, expect, it } from "vitest";
import { scanPhysicalLines } from "../../src/core/source-lines";
import { parseAtxHeadings } from "../../src/core/heading-parser";
import { parseDocumentSemantics } from "../../src/core/document-semantics";
import { parseDocumentNotes } from "../../src/core/note-semantics";
import { planHeadingTransform } from "../../src/core/transform";
import { BUILT_IN_SCHEMES } from "../../src/core/schemes";

describe("shared physical source boundaries", () => {
  it.each(["\n", "\r\n", "\r"])("protects scalar content and preserves %j offsets during Write", (eol) => {
    for (const delimiter of ["---", "..."]) {
      for (const scalar of ["|", ">", "|-", ">+"]) {
        const yaml = ["\uFEFF---", `description: ${scalar}`, `  ${delimiter}`, "  # Hidden", "  Figure: Hidden",
          "  @[[#Real]]", "  [^x]: Hidden", "---"].join(eol);
        const source = `${yaml}${eol}# Real${eol}## Child${eol}`;
        expect(parseAtxHeadings(source).map((heading) => heading.content)).toEqual(["Real", "Child"]);
        expect(parseDocumentSemantics(source).captions).toEqual([]);
        expect(parseDocumentSemantics(source).references).toEqual([]);
        expect(parseDocumentNotes(source).definitions).toEqual([]);
        const plan = planHeadingTransform(source, "write", {
          numbering: { scheme: BUILT_IN_SCHEMES.hierarchical, missingLevelStrategy: "fill-one", starts: {} },
          writeMarkers: false, cleanupScope: "templates", templateSources: [],
          removeMultiplePrefixes: true, normalizeManualOnRenumber: true,
        });
        expect(plan.result).toBe(`${yaml}${eol}# 1 Real${eol}## 1.1 Child${eol}`);
        for (const line of scanPhysicalLines(source)) expect(source.slice(line.from, line.to)).toBe(line.text);
      }
    }
  });

  it("keeps unclosed frontmatter protected and accepts only column-zero delimiters", () => {
    expect(parseAtxHeadings("---\nx: |\n  ...\n  # Hidden")).toEqual([]);
    expect(parseAtxHeadings("---\nx: value\n... \t\n# Body")).toHaveLength(1);
    expect(scanPhysicalLines("A\rB\r\nC\n").map(({ from, to }) => [from, to]))
      .toEqual([[0, 1], [2, 3], [5, 6], [7, 7]]);
  });
});
