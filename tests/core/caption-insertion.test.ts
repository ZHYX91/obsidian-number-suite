import { describe, expect, it } from "vitest";

import {
  createCaptionInsertionPlan,
  findCaptionInsertionTarget,
  findCaptionInsertionTargetForTable,
} from "../../src/core/caption-insertion";

function offsetOf(source: string, needle: string): number {
  const offset = source.indexOf(needle);
  if (offset < 0) throw new Error(`Missing test needle: ${needle}`);
  return offset;
}

describe("caption insertion", () => {
  it("offers a Figure caption for standalone wiki and Markdown images", () => {
    const wiki = "Before\n\n![[images/Miao.jpg|500]]\n\nAfter";
    expect(findCaptionInsertionTarget(wiki, offsetOf(wiki, "Miao"))).toMatchObject({
      kind: "Figure",
      action: "insert",
      suggestedTitle: "Miao",
    });

    const markdown = "![Lunch](images/lunch.png)";
    expect(findCaptionInsertionTarget(markdown, offsetOf(markdown, "Lunch"))).toMatchObject({
      kind: "Figure",
      suggestedTitle: "Lunch",
    });
  });

  it("does not treat note embeds, inline images, or protected images as standalone figures", () => {
    const noteEmbed = "![[Another note]]";
    const inline = "Text ![Lunch](lunch.png)";
    const fenced = "```md\n![[Miao.png]]\n```";
    const footnote = "[^detail]: note\n  ![[Miao.png]]";
    expect(findCaptionInsertionTarget(noteEmbed, 3)).toBeNull();
    expect(findCaptionInsertionTarget(inline, offsetOf(inline, "Lunch"))).toBeNull();
    expect(findCaptionInsertionTarget(fenced, offsetOf(fenced, "Miao"))).toMatchObject({
      kind: "Code",
      action: "insert",
    });
    expect(findCaptionInsertionTarget(footnote, offsetOf(footnote, "Miao"))).toBeNull();
  });

  it("offers a Table caption from every row in a top-level Markdown table", () => {
    const source = "Intro\n\n| Name | Value |\n| --- | ---: |\n| Miao | 1 |\n| Long table row | 2 |\n\nEnd";
    for (const needle of ["Name", "---:", "Miao", "Long table row"]) {
      expect(findCaptionInsertionTarget(source, offsetOf(source, needle))).toMatchObject({
        kind: "Table",
        action: "insert",
      });
    }
  });

  it("maps Structural Tables takeover indexes and keeps multi-row headers intact", () => {
    const source = [
      "Intro",
      "",
      "| Region | Sales |",
      "| Quarter | Q1 |",
      "| --- || --- |",
      "| North | 10 |",
      "",
      "| Name | Value |",
      "| --- | --- |",
      "| Miao | 1 |",
    ].join("\n");
    const first = findCaptionInsertionTargetForTable(source, 0);
    const second = findCaptionInsertionTargetForTable(source, 1);

    expect(first).toMatchObject({ kind: "Table", action: "insert", line: 2 });
    expect(second).toMatchObject({ kind: "Table", action: "insert", line: 7 });
    expect(createCaptionInsertionPlan(source, offsetOf(source, "Quarter"), "Sales")?.result).toContain(
      "Table: Sales\n\n| Region | Sales |\n| Quarter | Q1 |",
    );
    expect(findCaptionInsertionTargetForTable(source, 2)).toBeNull();
  });

  it("stores Figure and Table captions above their objects", () => {
    const image = "Before\r\n![[Miao.png]]\r\nAfter";
    expect(createCaptionInsertionPlan(image, offsetOf(image, "Miao"), "A cat")?.result).toBe(
      "Before\r\n\r\nFigure: A cat\r\n\r\n![[Miao.png]]\r\nAfter",
    );

    const table = "Before\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    expect(createCaptionInsertionPlan(table, offsetOf(table, " A "), "Results")?.result).toBe(
      "Before\n\nTable: Results\n\n| A | B |\n| --- | --- |\n| 1 | 2 |",
    );
  });

  it("keeps a following block ID attached to the image", () => {
    const source = "![[Miao.png]]\n^miao\nNext";
    expect(createCaptionInsertionPlan(source, offsetOf(source, "Miao"), "Cat")?.result).toBe(
      "Figure: Cat\n\n![[Miao.png]]\n^miao\nNext",
    );
  });

  it("offers captions only for standalone display equations and fenced code blocks", () => {
    const equation = "Before\n\n$$\nE = mc^2\n$$\n\nAfter";
    expect(findCaptionInsertionTarget(equation, offsetOf(equation, "mc"))).toMatchObject({
      kind: "Equation",
      action: "insert",
    });
    expect(createCaptionInsertionPlan(equation, offsetOf(equation, "mc"), "Energy")?.result)
      .toContain("Equation: Energy\n\n$$\nE = mc^2\n$$");

    const code = "```ts\nconst value = 1;\n```";
    expect(findCaptionInsertionTarget(code, offsetOf(code, "value"))).toMatchObject({
      kind: "Code",
      action: "insert",
    });
    expect(createCaptionInsertionPlan(code, offsetOf(code, "value"), "Example")?.result).toBe(
      "Code: Example\n\n```ts\nconst value = 1;\n```",
    );
    expect(findCaptionInsertionTarget("Text $x$ and `code`", 7)).toBeNull();
    expect(findCaptionInsertionTarget("| A |\n| --- |\n| $x$ |", 20)).toMatchObject({ kind: "Table" });
  });

  it("offers a bounded migration for legacy Figure captions below images", () => {
    const source = "![[Miao.png]]\n\nFigure: Miao\n\nNext";
    expect(findCaptionInsertionTarget(source, offsetOf(source, "Miao.png"))).toMatchObject({
      kind: "Figure",
      action: "relocate",
      suggestedTitle: "Miao",
    });
    expect(createCaptionInsertionPlan(source, offsetOf(source, "Miao.png"), "Miao")?.result).toBe(
      "Figure: Miao\n\n![[Miao.png]]\n\nNext",
    );
  });

  it("normalizes a nearby lowercase caption instead of inserting a duplicate", () => {
    const source = "figure: Miao\n\n![[Miao.png]]";
    const target = findCaptionInsertionTarget(source, offsetOf(source, "Miao.png"));
    expect(target).toMatchObject({
      kind: "Figure",
      action: "normalize",
      suggestedTitle: "Miao",
    });
    expect(createCaptionInsertionPlan(source, offsetOf(source, "Miao.png"), "Miao")?.result).toBe(
      "Figure: Miao\n\n![[Miao.png]]",
    );
  });

  it("does not offer another action beside an existing exact caption", () => {
    const figure = "Figure: Miao\n\n![[Miao.png]]";
    const table = "Table: Results\n\n| A |\n| --- |\n| 1 |";
    expect(findCaptionInsertionTarget(figure, offsetOf(figure, "Miao.png"))).toBeNull();
    expect(findCaptionInsertionTarget(table, offsetOf(table, " 1 "))).toBeNull();
  });

  it("preserves a cross-kind caption already bound to an object", () => {
    const compositeFigure = [
      "Figure: Comparison",
      "",
      "| Before | After |",
      "| --- | --- |",
      "| ![[before.png]] | ![[after.png]] |",
    ].join("\n");
    expect(findCaptionInsertionTarget(compositeFigure, offsetOf(compositeFigure, "Before"))).toBeNull();

    const legacy = [
      "| Before | After |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "Figure: Comparison",
    ].join("\n");
    const target = findCaptionInsertionTarget(legacy, offsetOf(legacy, " 1 "));
    expect(target).toMatchObject({ kind: "Figure", action: "relocate" });
    expect(createCaptionInsertionPlan(legacy, offsetOf(legacy, " 1 "), "Comparison")?.result).toBe([
      "Figure: Comparison",
      "",
      "| Before | After |",
      "| --- | --- |",
      "| 1 | 2 |",
    ].join("\n"));
  });

  it("offers no repair when one caption is ambiguous between two objects", () => {
    const source = [
      "![[before.png]]",
      "",
      "Figure: Comparison",
      "",
      "![[after.png]]",
    ].join("\n");
    expect(findCaptionInsertionTarget(source, offsetOf(source, "before.png"))).toBeNull();
    expect(findCaptionInsertionTarget(source, offsetOf(source, "after.png"))).toBeNull();
  });

  it("rejects empty, multiline, and out-of-range plans", () => {
    const source = "![[Miao.png]]";
    expect(createCaptionInsertionPlan(source, 3, "   ")).toBeNull();
    expect(createCaptionInsertionPlan(source, 3, "One\nTwo")).toBeNull();
    expect(findCaptionInsertionTarget(source, -1)).toBeNull();
    expect(findCaptionInsertionTarget(source, source.length + 1)).toBeNull();
  });
});
