import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { LOCALE_DE } from "../src/config/locales/de.ts";

const browser = await chromium.launch(process.env.CHROME_BIN
  ? { executablePath: process.env.CHROME_BIN } : { channel: "chrome" });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
  // The second select measures the natural text width in Obsidian. Hiding or
  // shrinking it produces an incorrect width for the actual dropdown.
  await page.setContent(`<style>
    main { container-type:inline-size; font:20px system-ui }
    .setting-item { position:relative; display:flex; gap:8px }
    .setting-item-control { display:flex; justify-content:flex-end; width:100% }
    .setting-item:not(.mod-toggle) .setting-item-control { justify-content:flex-start }
    .dropdown.is-measuring { position:absolute; visibility:hidden; width:max-content!important; max-width:none!important }
    button { white-space:nowrap }
  </style><main><section class="number-suite-settings-panel"><div class="setting-item">
    <div class="setting-item-control"><select class="dropdown"><option>Aktuell</option></select>
    <select aria-hidden="true" tabindex="-1" class="dropdown is-measuring">
      <option>Nummern nach bekannten Schematiteln und benutzerdefinierten Nummerierungen erkennen</option>
    </select></div></div><p class="number-suite-settings-guide-exterior">Schreibweise (Überschriftenebene.Zahlenformat)</p></section></main>`);
  await page.addStyleTag({ path: "styles.css" });
  await page.locator("main").evaluate((main) => {
    const preview = main.querySelector("section").cloneNode(true);
    preview.className = "number-suite-sidebar-preview";
    main.append(preview);
  });
  for (const direction of ["ltr", "rtl"]) {
    for (const width of [260, 320, 760]) {
      const panels = await page.evaluate(({ direction, width }) => {
        const main = document.querySelector("main");
        main.dir = direction;
        main.style.width = width + "px";
        return Array.from(main.querySelectorAll("section"), (panel) => ({
          name: panel.className,
          actual: panel.scrollWidth,
          expected: panel.clientWidth,
          measured: panel.querySelector(".is-measuring").offsetWidth,
        }));
      }, { direction, width });
      for (const panel of panels) {
        assert.ok(panel.actual <= panel.expected + 1, `${panel.name} ${direction} ${width}px overflow: ${panel.actual}`);
        assert.ok(panel.measured > 320, "Host dropdown must still measure natural width");
      }
    }
  }
  // A long action can have a narrow column even in the desktop settings window.
  await page.setContent(`<style>
    main { width:611px; font:15px system-ui }
    .setting-item { display:flex; align-items:center; gap:8px; padding:16px }
    .setting-item-info { flex:1 }
    .setting-item-control { display:flex; justify-content:flex-end; flex:0 1 11rem }
    button { font:inherit; height:30px; white-space:nowrap; padding-inline:12px }
  </style><main><section class="number-suite-settings-panel"><div class="setting-item">
    <div class="setting-item-info"></div><div class="setting-item-control"><button></button></div>
  </div></section></main>`);
  await page.addStyleTag({ path: "styles.css" });
  await page.locator(".setting-item-info").evaluate((node, text) => { node.textContent = text; }, LOCALE_DE["settings.reset"]);
  await page.locator("button").evaluate((node, text) => { node.textContent = text; }, LOCALE_DE["settings.reset.button"]);
  for (const fontSize of [15, 20]) {
    const fits = await page.locator("button").evaluate((button, fontSize) => {
      button.style.fontSize = fontSize + "px";
      const range = document.createRange();
      range.selectNodeContents(button);
      const bounds = button.getBoundingClientRect();
      const lines = Array.from(range.getClientRects());
      return lines.length > 0 && lines.every((line) =>
        line.left >= bounds.left - 1 && line.right <= bounds.right + 1
        && line.top >= bounds.top - 1 && line.bottom <= bounds.bottom + 1);
    }, fontSize);
    assert.ok(fits, `German reset label exceeds its desktop button at ${fontSize}px`);
  }
  console.log("Settings preserve dropdown measurements and keep the German desktop reset label inside its button.");
} finally {
  await browser.close();
}
