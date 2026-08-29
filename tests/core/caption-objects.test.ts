import { describe, expect, it } from "vitest";

import {
  bindCaptionObjects,
  imageTextAtOffset,
  meaningfulImageReplacementText,
  scanCaptionObjects,
  standaloneImageText,
} from "../../src/core/caption-objects";
import { parseDocumentSemantics } from "../../src/core/document-semantics";

const CAPTION_KIND_CASES = ["Figure", "Table", "Equation", "Code"] as const;
const CARRIER_CASES = [
  { objectKind: "Figure", objectSource: "![[carrier.png]]" },
  { objectKind: "Table", objectSource: "| A |\n| --- |\n| 1 |" },
  { objectKind: "Equation", objectSource: "$$ x = 1 $$" },
  { objectKind: "Code", objectSource: "```ts\nconst x = 1;\n```" },
] as const;
const CAPTION_CARRIER_CASES = CAPTION_KIND_CASES.flatMap((captionKind) => (
  CARRIER_CASES.map((carrier) => ({ captionKind, ...carrier }))
));
const BELOW_CAPTION_CARRIER_CASES = CAPTION_CARRIER_CASES.flatMap((item) => (
  [0, 1].map((blankLines) => ({ blankLines, ...item }))
));
const BLANK_LINE_CASES = CARRIER_CASES.flatMap((carrier) => (
  [0, 1, 2].map((blankLines) => ({ blankLines, ...carrier }))
));

describe("caption object binding", () => {
  it("extracts replacement text separately from size and filename fallbacks", () => {
    expect(standaloneImageText("![[images/Miao.png|替换文字]]")).toEqual({
      suggestedTitle: "替换文字",
      replacementText: "替换文字",
    });
    expect(standaloneImageText("![[images/Miao.png|500x300]]")).toEqual({
      suggestedTitle: "Miao",
      replacementText: "",
    });
    expect(standaloneImageText("![Lunch](images/miao.png)")).toEqual({
      suggestedTitle: "Lunch",
      replacementText: "Lunch",
    });
    expect(meaningfulImageReplacementText("500x300")).toBe("");
    expect(meaningfulImageReplacementText("miao.png")).toBe("");
    expect(meaningfulImageReplacementText("Lunch photo")).toBe("Lunch photo");
  });

  it("finds inline and table-cell replacement text without making them caption objects", () => {
    const source = "Text ![Lunch](lunch.png)\n| A |\n| --- |\n| ![[miao.png|Cat]] |";
    expect(imageTextAtOffset(source, source.indexOf("Lunch"))?.replacementText).toBe("Lunch");
    expect(imageTextAtOffset(source, source.indexOf("Cat"))?.replacementText).toBe("Cat");
    expect(scanCaptionObjects(source).filter((object) => object.kind === "Figure")).toEqual([]);
  });

  it("binds all four caption kinds across zero or one blank line", () => {
    const source = [
      "Figure: Image",
      "![[miao.png|Cat]]",
      "",
      "",
      "Table: Results",
      "",
      "| A |",
      "| --- |",
      "| 1 |",
      "",
      "",
      "Equation: Energy",
      "",
      "$$ E = mc^2 $$",
      "",
      "",
      "Code: Example",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");
    expect(bindCaptionObjects(source).map(({ caption, sourcePlacement }) => ({
      kind: caption.kind,
      sourcePlacement,
    }))).toEqual([
      { kind: "Figure", sourcePlacement: "above" },
      { kind: "Table", sourcePlacement: "above" },
      { kind: "Equation", sourcePlacement: "above" },
      { kind: "Code", sourcePlacement: "above" },
    ]);
  });

  it.each(CAPTION_CARRIER_CASES)(
    "binds $captionKind semantics to a $objectKind carrier",
    ({ captionKind, objectKind, objectSource }) => {
      const binding = bindCaptionObjects(`${captionKind}: Pair\n\n${objectSource}`);
      expect(binding).toHaveLength(1);
      expect(binding[0]).toMatchObject({
        caption: { kind: captionKind, title: "Pair" },
        object: { kind: objectKind },
        sourcePlacement: "above",
      });
    },
  );

  it.each(BELOW_CAPTION_CARRIER_CASES)(
    "binds $captionKind semantics below a $objectKind carrier across $blankLines blank lines",
    ({ blankLines, captionKind, objectKind, objectSource }) => {
      const separator = "\n".repeat(blankLines + 1);
      const binding = bindCaptionObjects(`${objectSource}${separator}${captionKind}: Pair`);
      expect(binding).toHaveLength(1);
      expect(binding[0]).toMatchObject({
        caption: { kind: captionKind, title: "Pair" },
        object: { kind: objectKind },
        sourcePlacement: "below",
      });
    },
  );

  it.each(BLANK_LINE_CASES)(
    "uses the $blankLines-blank-line rule for a $objectKind carrier",
    ({ blankLines, objectKind, objectSource }) => {
      const separator = "\n".repeat(blankLines + 1);
      const bindings = bindCaptionObjects(`Figure: Spacing${separator}${objectSource}`);
      if (blankLines <= 1) {
        expect(bindings).toHaveLength(1);
        expect(bindings[0]?.object.kind).toBe(objectKind);
      } else {
        expect(bindings).toEqual([]);
      }
    },
  );

  it("does not use a unique global matching to unlock a locally ambiguous chain", () => {
    const source = [
      "Figure: First",
      "",
      "![[first.png]]",
      "",
      "Figure: Gallery",
      "",
      "| A |",
      "| --- |",
      "| ![[inside.png]] |",
    ].join("\n");
    expect(bindCaptionObjects(source)).toEqual([]);
  });

  it("recognizes legacy captions below objects but leaves two-blank captions unbound", () => {
    expect(bindCaptionObjects("![[miao.png]]\n\nFigure: Miao")[0]?.sourcePlacement).toBe("below");
    expect(bindCaptionObjects("Figure: Orphan\n\n\n![[miao.png]]")).toEqual([]);
  });

  it("leaves both object-side and caption-side ambiguities unbound", () => {
    expect(bindCaptionObjects([
      "Figure: Above",
      "![[miao.png]]",
      "Figure: Below",
    ].join("\n"))).toEqual([]);

    expect(bindCaptionObjects([
      "![[before.png]]",
      "Figure: Comparison",
      "![[after.png]]",
    ].join("\n"))).toEqual([]);
  });

  it("keeps an unbound caption as a semantic caption", () => {
    const source = "Figure: Planned image\n\n\n![[later.png]]";
    expect(bindCaptionObjects(source)).toEqual([]);
    expect(parseDocumentSemantics(source).captions).toMatchObject([
      { kind: "Figure", title: "Planned image" },
    ]);
  });

  it("keeps visual object bounds separate from following block IDs", () => {
    const source = "Figure: Miao\n\n![[miao.png]]\n\n^miao";
    const object = bindCaptionObjects(source)[0]?.object;
    expect(source.slice(object?.visualFrom, object?.visualTo)).toBe("![[miao.png]]");
    expect(source.slice(object?.from, object?.to)).toBe("![[miao.png]]\n\n^miao");
  });
});
