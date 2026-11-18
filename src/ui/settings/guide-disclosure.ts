/** Per-settings-window tutorial state, never persisted to plugin settings. */
export function collapseSettingsGuides(root: HTMLElement, expanded: Set<string>): void {
  const guides = root.querySelectorAll<HTMLElement>(".number-suite-settings-guide:not(details)");
  for (const guide of Array.from(guides)) {
    const heading = guide.querySelector<HTMLElement>(".number-suite-settings-guide-heading");
    const title = heading?.querySelector<HTMLElement>("strong")?.textContent?.trim() ?? "";
    const key = [...guide.classList].find((name) => name.endsWith("-guide") && name !== "number-suite-settings-guide")
      ?? title;
    const content = guide.querySelector<HTMLElement>(".number-suite-settings-guide-body");
    if (content == null || title === "") continue;
    const details = guide.ownerDocument.createElement("details");
    details.className = guide.className + " is-collapsible";
    const summary = guide.ownerDocument.createElement("summary");
    summary.textContent = title;
    details.appendChild(summary);
    // One short, essential description remains visible without expanding the
    // tutorial. Operation safety warnings must also stay outside the details.
    const intro = content.querySelector(":scope > p");
    if (intro != null) {
      intro.classList.add("number-suite-settings-guide-exterior");
      guide.parentElement?.insertBefore(intro, guide);
    }
    if (guide.classList.contains("number-suite-file-operations-guide")
      || guide.classList.contains("number-suite-batch-guide")) {
      // File operations: "operations" and "safety". Batch operations:
      // "safety" and "exclusions". All must remain visible, not merely
      // the final paragraph (which otherwise hides the batch risk warning).
      for (const risk of Array.from(content.querySelectorAll(":scope > p"))) {
        if (risk === intro) continue;
        risk.classList.add("number-suite-settings-guide-exterior");
        guide.parentElement?.insertBefore(risk, guide);
      }
    }
    details.appendChild(content);
    details.open = expanded.has(key);
    details.addEventListener("toggle", () => {
      if (details.open) expanded.add(key);
      else expanded.delete(key);
    });
    guide.replaceWith(details);
  }
}
