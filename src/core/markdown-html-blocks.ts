const RAW_HTML_TAGS = new Set(["pre", "script", "style", "textarea"]);
const BLOCK_HTML_TAGS = new Set([
  "address", "article", "aside", "base", "basefont", "blockquote", "body",
  "caption", "center", "col", "colgroup", "dd", "details", "dialog", "dir",
  "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
  "frame", "frameset", "h1", "h2", "h3", "h4", "h5", "h6", "head",
  "header", "hr", "html", "iframe", "legend", "li", "link", "main", "menu",
  "menuitem", "nav", "noframes", "ol", "optgroup", "option", "p", "param",
  "search", "section", "summary", "table", "tbody", "td", "tfoot", "th",
  "thead", "title", "tr", "track", "ul",
]);

export function leadingMarkup(text: string): string | null {
  const match = /^ {0,3}(\S.*)$/u.exec(text);
  return match?.[1] ?? (text.trim().length === 0 ? "" : null);
}

export function startsRawHtmlBlock(markup: string): boolean {
  const tag = /^<([A-Za-z]+)(?=[ \t]|>|$)/u.exec(markup)?.[1];
  return tag !== undefined && RAW_HTML_TAGS.has(tag.toLowerCase());
}

// CommonMark type 1 ends at the first exact closing tag from this set,
// including when the closing tag differs from the opener.
export function endsRawHtmlBlock(text: string): boolean {
  for (const match of text.matchAll(/<\/([A-Za-z]+)>/gu)) {
    if (RAW_HTML_TAGS.has(match[1]!.toLowerCase())) return true;
  }
  return false;
}

export function blockHtmlStart(markup: string): boolean {
  const match = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?:[ \t]|\/?>|$)/u.exec(markup);
  const tag = match?.[1]?.toLowerCase() ?? null;
  return tag != null && BLOCK_HTML_TAGS.has(tag);
}

// CommonMark attributes have distinct name and value tokens. An unfinished
// attribute must not require trying different splits of the same text.
const ATTRIBUTE = /[ \t]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t]*=[ \t]*(?:"[^"]*"|'[^']*'|[^ \t"'=<>`]+))?/u;
const COMPLETE_OPEN_TAG = new RegExp(`^<[A-Za-z][A-Za-z0-9-]*(?:${ATTRIBUTE.source})*[ \\t]*/?>[ \\t]*$`, "u");
const COMPLETE_CLOSE_TAG = /^<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>[ \t]*$/u;

export function completeCustomHtmlTag(markup: string): boolean {
  return COMPLETE_OPEN_TAG.test(markup) || COMPLETE_CLOSE_TAG.test(markup);
}
