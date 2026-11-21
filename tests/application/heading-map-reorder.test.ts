import { describe, expect, it } from "vitest";
import { planSameParentHeadingMove } from "../../src/application/heading-map-reorder";

function moved(source: string, fromLine: number, toLine: number, side: "before" | "after"): string | null {
  const plan = planSameParentHeadingMove(source, fromLine, toLine, side);
  if (plan == null) return null;
  expect(source.slice(plan.from, plan.to)).toBe(plan.original);
  expect(plan.expectedSource).toBe(source);
  return source.slice(0, plan.from) + plan.replacement + source.slice(plan.to);
}

describe("heading mind-map same-parent section rearrangement", () => {
  const text = [
    "Preamble stays",
    "## Alpha",
    "Body A",
    "### Child A",
    "Nested body",
    "Figure: Diagram",
    "## Beta",
    "Body B",
    "## Gamma",
    "Last body",
  ].join("\n");

  it("moves whole sections, nested headings and caption text intact", () => {
    expect(moved(text, 1, 6, "after")).toBe([
      "Preamble stays",
      "## Beta",
      "Body B",
      "## Alpha",
      "Body A",
      "### Child A",
      "Nested body",
      "Figure: Diagram",
      "## Gamma",
      "Last body",
    ].join("\n"));
  });

  it("moves a terminal sibling before the first and keeps no-final-newline policy", () => {
    expect(moved(text, 8, 1, "before")).toBe([
      "Preamble stays",
      "## Gamma",
      "Last body",
      "## Alpha",
      "Body A",
      "### Child A",
      "Nested body",
      "Figure: Diagram",
      "## Beta",
      "Body B",
    ].join("\n"));
  });

  it("preserves CRLF and the final-newline state", () => {
    const source = "## A\r\nA\r\n## B\r\nB\r\n## C\r\nC\r\n";
    expect(moved(source, 4, 0, "before")).toBe("## C\r\nC\r\n## A\r\nA\r\n## B\r\nB\r\n");
  });

  it("never silently changes levels, parents or descendant boundaries", () => {
    const source = "# Root\n## One\n### Child\ntext\n## Two\n# Other\n## Three\n";
    expect(moved(source, 1, 2, "after")).toBeNull();
    expect(moved(source, 1, 6, "before")).toBeNull();
    expect(moved(source, 1, 4, "before")).toBeNull();
    expect(moved(source, 4, 1, "after")).toBeNull();
    expect(moved(source, 1, 1, "after")).toBeNull();
  });

  it.each(["\n", "\r\n"])("honors Setext parents and section ends with %j", (eol) => {
    const note = ["# Parent A", "## Apples", "one", "## Plums", "two", "",
      "Parent B", "========", "## Pears", "three"].join(eol);
    expect(moved(note, 1, 8, "after")).toBeNull();
    expect(moved(note, 8, 3, "before")).toBeNull();
    expect(moved(note, 1, 3, "after")).toBe(
      ["# Parent A", "## Plums", "two", "## Apples", "one", "", "Parent B", "========", "## Pears", "three"].join(eol),
    );
  });

  it("refuses to absorb an unrelated Setext title into a moved paragraph", () => {
    const note = "# Parent\n## Apples\none\n## Plums\nNext chapter\n========\n## Pears";
    expect(moved(note, 1, 3, "after")).toBeNull();
  });

  it("accepts sibling extended headings but ignores code and malformed headings", () => {
    const source = "######## Deep A\nA\n```\n######## Not heading\n```\n######## Deep B\nB\n";
    expect(moved(source, 5, 0, "before")).toBe(
      "######## Deep B\nB\n######## Deep A\nA\n```\n######## Not heading\n```\n",
    );
    expect(moved(source, 3, 0, "before")).toBeNull();
  });
});
