import { describe, expect, it } from "vitest";

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

  it("creates a collision-safe ID and preserves CRLF", () => {
    const source = "# Miao\r\n^ns-h-miao\r\n\r\n# Miao";
    const plan = createStableReferencePlan(source, source.length - 2);
    expect(plan?.blockId).toBe("ns-h-miao-2");
    expect(plan?.change?.insert).toBe("\r\n^ns-h-miao-2");
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
});
