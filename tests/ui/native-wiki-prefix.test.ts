// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  hideNativeWikiHeadingPrefix,
  restoreNativeWikiHeadingPrefix,
} from "../../src/ui/native-wiki-prefix";

function anchor(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "internal-link";
  link.href = "#one";
  link.setAttribute("data-href", "Note#一、实验设计");
  link.append(document.createTextNode("一"), document.createTextNode("、"), document.createTextNode("实验设计"));
  return link;
}

describe("native Wiki heading visual prefix concealment", () => {
  it("preserves original href, identity, listeners and source-derived text on reversible hide", () => {
    const link = anchor();
    document.body.append(link);
    let clicks = 0;
    link.addEventListener("click", () => { clicks += 1; });
    const initial = link.textContent;
    const href = link.getAttribute("data-href");
    expect(hideNativeWikiHeadingPrefix(link, "一、")).toBe(true);
    expect(link.querySelectorAll(".number-suite-native-wiki-hidden-prefix")).toHaveLength(2);
    expect(link.getAttribute("data-href")).toBe(href);
    expect(link.textContent).toBe(initial);
    link.click();
    expect(clicks).toBe(1);
    restoreNativeWikiHeadingPrefix(link);
    expect(link.textContent).toBe(initial);
    expect(link.querySelector(".number-suite-native-wiki-hidden-prefix")).toBeNull();
    expect(link.getAttribute("data-href")).toBe(href);
    link.click();
    expect(clicks).toBe(2);
  });

  it("fails closed for labels that do not start with the exact source prefix", () => {
    const link = anchor();
    expect(hideNativeWikiHeadingPrefix(link, "2.1")).toBe(false);
    expect(link.querySelector(".number-suite-native-wiki-hidden-prefix")).toBeNull();
    expect(link.textContent).toBe("一、实验设计");
  });

  it("never hides an authored alias, and never consumes an inert number badge", () => {
    const link = anchor();
    link.textContent = "Custom alias";
    expect(hideNativeWikiHeadingPrefix(link, "一、")).toBe(false);
    const another = anchor();
    const badge = document.createElement("span");
    badge.className = "number-suite-native-wiki-number";
    badge.textContent = "1";
    another.prepend(badge);
    expect(hideNativeWikiHeadingPrefix(another, "一、")).toBe(true);
    expect(badge.textContent).toBe("1");
    restoreNativeWikiHeadingPrefix(another);
    expect(another.textContent).toBe("1一、实验设计");
  });

  it("treats source WORD JOINER markers as invisible presentation metadata", () => {
    const link = anchor();
    expect(hideNativeWikiHeadingPrefix(link, "\u2060一、\u2060")).toBe(true);
    restoreNativeWikiHeadingPrefix(link);
    expect(link.textContent).toBe("一、实验设计");
  });
});
