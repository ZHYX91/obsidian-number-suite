import { describe, expect, it } from "vitest";
import { HeadingMapIdentity } from "../../src/application/heading-map-identity";
import { parseAtxHeadings } from "../../src/core/heading-parser";

describe("heading map source identities", () => {
  function session() {
    const identities = new HeadingMapIdentity();
    return (source: string) => [...identities.update(source, parseAtxHeadings(source)).values()];
  }

  it("preserves identities across title, level, numbering and line-ending edits", () => {
    const update = session();
    const original = update("# Title\nbody\n## Child");
    expect(update("# Renamed\nbody\n### 3.2 Child\n")).toEqual(original);
    expect(update("# Renamed\r\nbody\r\n### 3.2 Child\r\n")).toEqual(original);
    expect(update("# Renamed\rbody\r### 3.2 Child\r")).toEqual(original);
  });

  it("uses surrounding source anchors for multiple insertions among duplicate titles", () => {
    const update = session();
    const original = update("# A\n## Same\nA body\n# B\n## Same\nB body\n# C\n## Same");
    const next = update("intro\n# Inserted\n## Same\n# A\n## Same\nA body\nextra\n# B\n## Same\nB body\n# Added\n# C\n## Same\nend");
    expect(next.slice(2, 6)).toEqual(original.slice(0, 4));
    expect(next.slice(7)).toEqual(original.slice(4));
    expect(new Set(next).size).toBe(next.length);
  });

  it("drops removed identities and does not reuse them for a new heading", () => {
    const update = session();
    const [root, removed, kept] = update("# Root\n## Removed\n## Kept");
    expect(update("# Root\n## Kept")).toEqual([root, kept]);
    const next = update("# Root\n## New\n## Kept");
    expect(next[1]).not.toBe(removed);
    expect(next[2]).toBe(kept);
  });

  it("does not alias an ambiguous replacement with a different line count", () => {
    const update = session();
    const original = update("# A\n## B");
    const next = update("# X\n## Y\n### Z");
    expect(next.some((id) => original.includes(id))).toBe(false);
  });

  it("keeps IDs unique when sections move and surrounding lines also change", () => {
    const update = session();
    const original = update("start\n# A\nalpha\n# B\nbeta\n# C\nend");
    const next = update("new start\n# C\n# A\nalpha\n# B\nbeta\nnew end");
    expect(next.slice(1)).toEqual(original.slice(0, 2));
    expect(new Set(next).size).toBe(3);
  });
});
