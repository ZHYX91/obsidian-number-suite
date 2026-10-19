import { describe, expect, it } from "vitest";

import { bindCaptionObjects } from "../../src/core/caption-objects";
import {
  createCaptionInsertionPlan,
  createCaptionInsertionPlanForTarget,
  findCaptionInsertionTarget,
} from "../../src/core/caption-insertion";
import { parseDocumentSemantics } from "../../src/core/document-semantics";

const CASES = [
  { name: "inline ID with a trailing HTML comment", source: "![[cat.png]]\n\nFigure: Cat ^cat-caption <!-- Keep this note -->" },
  { name: "inline ID below the image", source: "![[cat.png]]\n\nFigure: Cat ^cat-caption" },
  { name: "standalone ID below the caption", source: "![[cat.png]]\n\nFigure: Cat\n^cat-caption" },
  { name: "standalone ID after a blank line", source: "![[cat.png]]\n\nFigure: Cat\n\n^cat-caption" },
  { name: "inline ID during capitalization repair", source: "figure: Cat ^cat-caption\n\n![[cat.png]]" },
  { name: "standalone ID during capitalization repair", source: "figure: Cat\n^cat-caption\n\n![[cat.png]]" },
  { name: "separate image and caption IDs", source: "![[cat.png]]\n^cat-image\n\nFigure: Cat\n^cat-caption" },
] as const;

describe("caption edit identity contracts", () => {
  it.each(CASES)("preserves $name and its semantic reference target", ({ source: captionSource }) => {
    const source = `${captionSource}\n\nSee @[[#^cat-caption|the cat]].`;
    const offset = source.indexOf("cat.png");
    const target = findCaptionInsertionTarget(source, offset);
    expect(target?.suggestedTitle).toBe("Cat");
    const plan = createCaptionInsertionPlan(source, offset, target?.suggestedTitle ?? "");
    expect(plan).not.toBeNull();
    const after = parseDocumentSemantics(plan!.result);
    const caption = after.captions[0];
    expect(caption?.title).toBe("Cat");
    expect(after.blockOwners.get("block:cat-caption")).toBe(caption?.line);
    expect(after.references.map((reference) => reference.target)).toEqual(["cat-caption"]);
    expect(bindCaptionObjects(plan!.result).map((binding) => ({
      title: binding.caption.title,
      object: plan!.result.slice(binding.object.visualFrom, binding.object.visualTo),
    }))).toEqual([{ title: "Cat", object: "![[cat.png]]" }]);
    expect(plan!.result).toContain("See @[[#^cat-caption|the cat]].");
    if (source.includes("^cat-image")) {
      const imageLine = plan!.result.slice(0, plan!.result.indexOf("![[cat.png]]")).split("\n").length - 1;
      expect(after.blockOwners.get("block:cat-image")).toBe(imageLine);
    }
  });

  it.each([
    "^first-id\n^second-id",
    "^first-id <!-- authored comment -->",
  ])("leaves an unsupported caption-ID tail untouched: %s", (tail) => {
    const source = `![[cat.png]]\n\nFigure: Cat\n${tail}`;
    expect(findCaptionInsertionTarget(source, source.indexOf("cat.png"))).toBeNull();
    expect(createCaptionInsertionPlan(source, source.indexOf("cat.png"), "Cat")).toBeNull();
  });

  it.each([
    { kind: "Figure", object: "![[cat.png]]" },
    { kind: "Table", object: "| A |\n| --- |\n| 1 |" },
    { kind: "Equation", object: "$$\nx\n$$" },
    { kind: "Code", object: "```js\nx\n```" },
  ])("leaves extra $kind object IDs outside the edit range untouched", ({ kind, object }) => {
    for (const newline of ["\n", "\r\n"]) {
      const source = [object, "^object-id", "^second-object-id", "", `${kind}: Title`,
        "", "See @[[#^second-object-id]]."].join("\n").replace(/\n/gu, newline);
      expect(findCaptionInsertionTarget(source, 1)).toBeNull();
      expect(createCaptionInsertionPlan(source, 1, "Edited title")).toBeNull();
    }
  });

  it("rejects a retained relocation target that skips authored content", () => {
    const initial = "![[cat.png]]\n^object-id\n\nFigure: Title";
    const target = findCaptionInsertionTarget(initial, 1);
    expect(target?.action).toBe("relocate");
    if (target == null) throw new Error("Missing supported relocation target");
    const extra = "^second-object-id\n";
    const source = `${initial.slice(0, target.from)}${extra}${initial.slice(target.from)}`;
    expect(createCaptionInsertionPlanForTarget(source, {
      ...target,
      from: target.from + extra.length,
      to: target.to + extra.length,
      line: target.line + 1,
    }, "Edited title")).toBeNull();
  });

  it("retains the exact authored ID suffix and CRLF while the visible title changes", () => {
    const source = "![[cat.png]]\r\n\r\nFigure: Cat  ^Cat-ID\t\r\n^second-id\r\n\r\nAfter";
    const plan = createCaptionInsertionPlan(source, source.indexOf("cat.png"), "A cat");
    expect(plan?.result).toBe("Figure: A cat  ^Cat-ID\t\r\n^second-id\r\n\r\n![[cat.png]]\r\n\r\nAfter");
    const semantics = parseDocumentSemantics(plan?.result ?? "");
    expect(semantics.blockOwners.get("block:cat-id")).toBe(0);
    expect(semantics.blockOwners.get("block:second-id")).toBe(0);
  });
});
