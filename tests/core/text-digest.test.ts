import { describe, expect, it } from "vitest";

import { digestText } from "../../src/core/text-digest";

describe("digestText", () => {
  it("returns the canonical SHA-256 digest for UTF-8 text", async () => {
    await expect(digestText("Heading 标题")).resolves.toBe(
      "sha256:3f8ea5cf54d9be4031065988fa13ea84059290d009cf541ae097841bba6cd2e5",
    );
  });
});
