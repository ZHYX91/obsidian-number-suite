/** Preserve Unicode code points and leave unchanged heading text unaccented. */
export function changedTextParts(before: string, after: string): {
  prefix: string; before: string; after: string; suffix: string;
} {
  const left = Array.from(before);
  const right = Array.from(after);
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start += 1;
  let end = 0;
  while (end < left.length - start && end < right.length - start
    && left[left.length - 1 - end] === right[right.length - 1 - end]) end += 1;
  return { prefix: left.slice(0, start).join(""), before: left.slice(start, left.length - end).join(""),
    after: right.slice(start, right.length - end).join(""), suffix: end === 0 ? "" : left.slice(-end).join("") };
}

export function renderPreviewDifference(container: HTMLElement, prefix: string, changed: string, suffix: string): void {
  const code = container.createEl("code");
  code.appendText(prefix);
  if (changed !== "") code.createEl("mark", { text: changed, cls: "number-suite-diff-changed" });
  code.appendText(suffix);
}
