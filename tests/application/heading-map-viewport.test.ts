import { describe, expect, it } from "vitest";

import { zoomHeadingMapViewport } from "../../src/application/heading-map-viewport";

describe("heading map viewport math", () => {
  it("keeps the logical point under the zoom anchor fixed", () => {
    const before = { scale: 1, offsetX: -120, offsetY: 80 };
    const anchor = { x: 410, y: 260 };
    const logical = {
      x: (anchor.x - before.offsetX) / before.scale,
      y: (anchor.y - before.offsetY) / before.scale,
    };
    const after = zoomHeadingMapViewport(before, 0.5, anchor.x, anchor.y, 0.38, 2.5);
    expect(logical.x * after.scale + after.offsetX).toBeCloseTo(anchor.x);
    expect(logical.y * after.scale + after.offsetY).toBeCloseTo(anchor.y);
  });

  it("clamps scale without introducing invalid coordinates", () => {
    expect(zoomHeadingMapViewport({ scale: 1, offsetX: 0, offsetY: 0 }, 0.01, 0, 0, 0.38, 2.5).scale).toBe(0.38);
    expect(zoomHeadingMapViewport({ scale: 1, offsetX: 0, offsetY: 0 }, 10, 0, 0, 0.38, 2.5).scale).toBe(2.5);
  });
});
