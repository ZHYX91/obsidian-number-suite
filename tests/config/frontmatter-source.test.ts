import { describe, expect, it } from "vitest";

import { notePropertySourceIssues } from "../../src/config/frontmatter-source";

describe("Number Suite frontmatter source checks", () => {
  it("rejects duplicate top-level Number Suite property keys", () => {
    expect(notePropertySourceIssues([
      "number-suite:",
      "  - heading.virtual=true",
      "number-suite:",
      "  - heading.virtual=false",
    ].join("\n"))).toEqual([{
      code: "source-ambiguous",
      field: "all",
      message: "Duplicate Number Suite property key requires manual review: number-suite",
    }]);
  });

  it("requires quoted plugin property keys to be reviewed manually", () => {
    expect(notePropertySourceIssues("'number-suite': [disabled=true]")[0]).toMatchObject({
      code: "source-ambiguous",
      field: "all",
    });
  });

  it("does not mistake indented list items for top-level properties", () => {
    expect(notePropertySourceIssues("number-suite:\n  - heading.scheme=legal")).toEqual([]);
  });
});
