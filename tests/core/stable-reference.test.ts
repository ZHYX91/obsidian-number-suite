import { describe, expect, it } from "vitest";

import { blockTargetKey, parseDocumentSemantics } from "../../src/core/document-semantics";
import { createStableReferencePlan } from "../../src/core/stable-reference";

describe("stable cross-reference planning", () => {
  it("creates a standalone block ID for a heading without changing its title", () => {
    const source = "# Architecture\nBody";
    const plan = createStableReferencePlan(source, 4);
    expect(plan).toMatchObject({
      blockId: "ns-h-architecture",
      link: "@[[#^ns-h-architecture|Architecture]]",
      target: { kind: "heading", line: 0, title: "Architecture" },
      change: {
        from: 14,
        to: 14,
        insert: "\n^ns-h-architecture",
        before: "# Architecture",
        after: "# Architecture\n^ns-h-architecture",
      },
    });
  });

  it("reuses inline and following IDs without planning a write", () => {
    expect(createStableReferencePlan("# Heading ^existing", 3)).toMatchObject({
      blockId: "existing",
      link: "@[[#^existing|Heading]]",
      change: null,
    });
    expect(createStableReferencePlan("Figure: Miao\n^figure-id", 9)).toMatchObject({
      blockId: "figure-id",
      link: "@[[#^figure-id|Miao]]",
      target: { kind: "caption", title: "Miao" },
      change: null,
    });
  });

  it("creates a caption block ID on the caption line", () => {
    const plan = createStableReferencePlan("Figure: Miao\n\n![[Miao.png]]", 8);
    expect(plan?.change).toMatchObject({
      insert: " ^ns-caption-miao",
      after: "Figure: Miao ^ns-caption-miao",
    });
  });

  it.each([
    "Figure: Title <!-- hidden\ncomment -->",
    "Figure: Title %% hidden\ncomment %%",
    "Figure: Title <!-- unclosed",
    "Figure: Title %% unclosed",
  ])("refuses an ID that would be hidden inside a caption comment: %s", (source) => {
    expect(createStableReferencePlan(source, 8)).toBeNull();
  });

  it.each(["\n", "\r\n", "\r"])("does not split multiline caption syntax with %j endings", (newline) => {
    for (const lines of [
      ["Figure: Title `hidden", "continued`"],
      ["Figure: Title ``hidden", "continued``"],
      ["Figure: Title <span", "data-x=\"value\">text</span>"],
      ["Figure: Title [link](target", "\"tooltip\")"],
      ["Figure: Title ![image](target", "\"tooltip\")"],
      ["Figure: Title *emphasized", "continued*"],
      ["Figure: Title ~~removed", "continued~~"],
    ]) {
      const source = ["# Earlier", "", ...lines].join(newline);
      expect(createStableReferencePlan(source, source.indexOf("Title"))).toBeNull();
    }
  });

  it.each([
    "Figure: Title <!-- hidden -->",
    "Figure: Title %% hidden %%",
    "Figure: Title `literal`",
    "Figure: Title `unmatched",
    "Figure: Title <span>text</span>",
    "Figure: Title [link](target \"tooltip\")",
    "Figure: Title *emphasized*",
    "Figure: Title ~~removed~~",
  ])("keeps a new caption ID bound outside closed protected syntax: %s", (source) => {
    const plan = createStableReferencePlan(source, 8);
    expect(plan?.change).not.toBeNull();
    const change = plan?.change;
    if (plan == null || change == null) throw new Error("Expected a caption ID plan");
    const result = source.slice(0, change.from) + change.insert + source.slice(change.to);
    expect(result).toBe(`${source} ^${plan.blockId}`);
    expect(parseDocumentSemantics(result).blockOwners.get(blockTargetKey(plan.blockId)))
      .toBe(plan.target.line);
  });

  it("creates a collision-safe ID and preserves CRLF", () => {
    const source = "# Miao\r\n^ns-h-miao\r\n\r\n# Miao";
    const plan = createStableReferencePlan(source, source.length - 2);
    expect(plan?.blockId).toBe("ns-h-miao-2");
    expect(plan?.change?.insert).toBe("\r\n^ns-h-miao-2");
  });

  it.each(["\n", "\r\n", "\r"])("refuses insertion inside multiline math with %j", (newline) => {
    for (const delimiter of ["$", "$$"]) {
      expect(createStableReferencePlan(`Figure: Title ${delimiter}x +${newline}y${delimiter}`, 8)).toBeNull();
    }
  });

  it.each([
    "Figure: Title $x + y$",
    "Figure: Title \\$x +\ny\\$",
    "Figure: Title `$x`\ny$",
    "Figure: Title $5\nordinary currency",
    "Figure: Title $x\n\ny$",
  ])("keeps closed or non-math dollar text writable: %s", (source) => {
    expect(createStableReferencePlan(source, 8)?.change).toBeTruthy();
  });

  it("uses a deterministic fallback for non-Latin titles and escapes aliases", () => {
    const plan = createStableReferencePlan("# 结果|附录]", 4);
    expect(plan?.blockId).toMatch(/^ns-h-[a-z0-9]+$/u);
    expect(plan?.link).toContain("|结果｜附录］]]");
  });

  it("offers only actual heading and caption lines", () => {
    expect(createStableReferencePlan("Body\nFigure: Caption", 2)).toBeNull();
    expect(createStableReferencePlan("```\n# Hidden\n```", 7)).toBeNull();
  });

  it("does not copy an ambiguous existing block ID", () => {
    const source = "# One ^duplicate\n\n# Two ^duplicate";
    expect(createStableReferencePlan(source, 3)).toBeNull();
  });

  it.each([
    "```txt\n^anchor\n```",
    "    ^anchor",
    "<!-- ^anchor -->",
    "%% ^anchor %%",
    "Example `^anchor`",
  ])("ignores protected block-ID examples: %s", (example) => {
    const source = `# Title ^anchor\n\n${example}`;
    expect(createStableReferencePlan(source, 3)).toMatchObject({
      blockId: "anchor",
      link: "@[[#^anchor|Title]]",
      change: null,
    });
  });

  it("still rejects a duplicate ID owned by an ordinary paragraph", () => {
    expect(createStableReferencePlan("# Title ^anchor\n\nBody ^anchor", 3)).toBeNull();
  });
});
