import { describe, expect, it, vi } from "vitest";
import { SemanticSnapshotCache } from "../../src/application/semantic-snapshot";
import { imageTooltipContentAtOffset } from "../../src/application/semantic-display-plan";

describe("semantic snapshots", () => {
  it("reuses source facts across selections and changes presentation without stale settings", () => {
    const cache = new SemanticSnapshotCache();
    const document = {};
    const source = "![Alt](image.png)\nFigure: Example";
    const read = vi.fn(() => source);
    const snapshot = cache.get(document, read);
    expect(cache.get(document, read)).toBe(snapshot);
    expect(read).toHaveBeenCalledTimes(1);
    expect(imageTooltipContentAtOffset(source, 4, true, snapshot)?.title).toBe("Figure 1: Example");
    expect(imageTooltipContentAtOffset(source, 4, false, snapshot)?.title).toBe("Figure: Example");
    const next = cache.get({}, () => source.replace("Example", "Changed"));
    expect(next).not.toBe(snapshot);
    expect(imageTooltipContentAtOffset(next.source, 4, true, next)?.title).toBe("Figure 1: Changed");
  });

  it("looks up inline images with original offsets without scanning the source again", () => {
    const source = "Text ![Inside](a.png) text\r\n\r\n# Next";
    const snapshot = new SemanticSnapshotCache().get({}, () => source);
    expect(imageTooltipContentAtOffset(source, 12, true, snapshot)).toEqual({ title: "", body: "Inside" });
    expect(imageTooltipContentAtOffset(source, -1, true, snapshot)).toBeNull();
    expect(imageTooltipContentAtOffset(source, source.length + 1, true, snapshot)).toBeNull();
  });
});
