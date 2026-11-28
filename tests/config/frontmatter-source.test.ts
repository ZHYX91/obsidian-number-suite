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
      details: { kind: "source-duplicate-key", key: "number-suite" },
    }]);
  });

  it("requires quoted plugin property keys to be reviewed manually", () => {
    expect(notePropertySourceIssues("'number-suite': [disabled=true]")[0]).toMatchObject({
      code: "source-ambiguous",
      field: "all",
    });
  });

  it("treats colons inside plain keys and Unicode edge spaces as part of their names", () => {
    expect(notePropertySourceIssues([
      "number-suite:owner: Ana",
      "number-suite:stage: review",
      "number-suite\u00a0: retained",
      "number-suite:\u3000suffix: retained",
      "number-suite: [heading.virtual=true]",
    ].join("\n"))).toEqual([]);
  });

  it("does not mistake indented list items for top-level properties", () => {
    expect(notePropertySourceIssues("number-suite:\n  - heading.scheme=legal")).toEqual([]);
  });
});
