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

export function rawHtmlStart(markup: string): string | null {
  const match = /^<([A-Za-z][A-Za-z0-9-]*)(?:\s|>|\/?>)/u.exec(markup);
  const tag = match?.[1]?.toLowerCase() ?? null;
  return tag != null && RAW_HTML_TAGS.has(tag) ? tag : null;
}

export function blockHtmlStart(markup: string): boolean {
  const match = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?:\s|\/?>|$)/u.exec(markup);
  const tag = match?.[1]?.toLowerCase() ?? null;
  return tag != null && BLOCK_HTML_TAGS.has(tag);
}

export function completeCustomHtmlTag(markup: string): boolean {
  return /^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+(?:[^<>"']+|"[^"]*"|'[^']*')*)?\s*\/?>[ \t]*$/u.test(markup);
}
