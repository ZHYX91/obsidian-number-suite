import { describe, expect, it } from "vitest";

import { syntaxNodeConfirmsHeading } from "../../src/editor/heading-display-extension";

describe("syntaxNodeConfirmsHeading", () => {
  it("accepts the supported desktop and mobile heading node names", () => {
    expect(syntaxNodeConfirmsHeading("ATXHeading", 2)).toBe(true);
    expect(syntaxNodeConfirmsHeading("ATXHeading2", 2)).toBe(true);
    expect(syntaxNodeConfirmsHeading("HeaderMark", 2)).toBe(true);
    expect(syntaxNodeConfirmsHeading("HyperMD-header", 2)).toBe(true);
    expect(syntaxNodeConfirmsHeading("HyperMD-header_H2", 2)).toBe(true);
    expect(syntaxNodeConfirmsHeading("HyperMD-header_HyperMD-header-2", 2)).toBe(true);
  });

  it("rejects mismatched levels and similarly named non-heading nodes", () => {
    expect(syntaxNodeConfirmsHeading("ATXHeading3", 2)).toBe(false);
    expect(syntaxNodeConfirmsHeading("HyperMD-header_H3", 2)).toBe(false);
    expect(syntaxNodeConfirmsHeading("HyperMD-header_HyperMD-header-3", 2)).toBe(false);
    expect(syntaxNodeConfirmsHeading("formatting-header-2", 2)).toBe(false);
    expect(syntaxNodeConfirmsHeading("HyperMD-codeblock", 2)).toBe(false);
  });
});
