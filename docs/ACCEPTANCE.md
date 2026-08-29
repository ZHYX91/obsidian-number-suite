# Runtime acceptance checklist

This is a non-authoritative execution checklist. The normative evidence rules are in the stable
[testing strategy](testing-strategy.en.md) and its [Chinese source](testing-strategy.zh-CN.md).

Automated checks are necessary but do not prove Obsidian runtime behavior. Complete this checklist
in a disposable acceptance Vault before publishing a release. Do not use a production Vault for
first acceptance.

## Test setup

- [ ] Build with `npm ci && npm run check`.
- [ ] Copy only `dist/main.js`, `dist/manifest.json`, and `dist/styles.css` into `.obsidian/plugins/number-suite/`.
- [ ] Hash-verify the copied files.
- [ ] Ensure no other heading-number plugin or CSS counter snippet is active.
- [ ] Record Obsidian version, OS, theme, and plugin version.

## Highest-value loop

- [ ] Click the ribbon icon and confirm it opens the persistent right sidebar on Document outline
  without changing the note or global settings; close and reopen it and verify the selected tab is
  preserved.
- [ ] Select Current note and confirm it names the active note and shows global, current-note
  override, and effective values. The command Open current note controls must select this tab.
- [ ] Set virtual display and concealment independently through Follow global / On / Off; re-open the panel and verify persistence and effective display.
- [ ] Choose a built-in and a custom scheme from the panel without typing an ID; Follow global must delete the scheme property.
- [ ] Enable note ignore, then restore all to Follow global; verify all plugin Properties are removed and unrelated Properties remain byte-for-byte equivalent.
- [ ] In Live Preview, show virtual numbers for an unnumbered note and confirm the file hash and mtime do not change.
- [ ] Switch to Reading View and confirm numbering continues correctly across rendered sections.
- [ ] Write numbers to the current note, inspect the preview, apply, then undo and redo once.
- [ ] Conceal the stored numbers, move the cursor into each heading, select across a prefix, copy, and use a Chinese IME.
- [ ] Enable virtual numbers and concealment together; each recognized stored prefix must be replaced by exactly one virtual number in Live Preview and Reading View.
- [ ] Reload and disable the plugin; confirm source text remains accessible and Reading View DOM decoration disappears.

## Number Suite outline

- [ ] Build one note containing H1-H9 plus Figure, Table, Equation, and Code captions before and
  within sections. Confirm nesting follows source heading levels and captions attach to the deepest
  preceding heading.
- [ ] Confirm displayed heading numbers match Live Preview, concealed stored prefixes are not
  duplicated, caption numbering follows its setting, and trailing authored block IDs do not appear
  in labels.
- [ ] Collapse and expand nested sections using pointer and keyboard. Confirm the selected state,
  focus ring, indentation, toggle position, row height, and label alignment remain consistent.
- [ ] Select every heading level and caption; confirm navigation reaches the exact source line in an
  existing editor or opens the note there without modifying Markdown.
- [ ] Edit headings and captions, switch notes and panes, save externally, and change per-note/global
  settings. Confirm the outline refreshes without stale entries or cross-file state.
- [ ] Open the same note in two editor panes. A Markdown-changing action from Current note must fail
  closed with a clear notice; closing one pane must restore the previewed action path.

## Captions and same-file references

- [ ] Verify `Figure:`, `Table:`, `Equation:`, and `Code:` each start at 1 and increment independently; `Listing:` remains unchanged.
- [ ] Verify captions without IDs are numbered and captions with inline or immediately following user-authored block IDs receive the same behavior.
- [ ] Confirm Live Preview and Reading View show whole-caption filled pills and `Figure 1:`-style labels while display-only use leaves Markdown bytes, mtime, and IDs unchanged; long captions must wrap.
- [ ] Bind every caption type to every standalone carrier type. Confirm `Figure:` can label a Markdown table containing multiple images, the caption counter follows Figure, and the carrier remains a table. Repeat with zero and one blank line; two blank lines must leave a still-numbered/referenceable but unbound caption. Put valid carriers on both sides or captions on both sides and confirm binding and context actions fail closed.
- [ ] With caption numbering off, confirm Figure and Equation default to centered while Table and Code follow the theme; toggle all four independently in both Live Preview and Reading View.
- [ ] In editing mode, right-click a standalone wiki image and Markdown image without selecting it first. Confirm the dialog follows the actual pointer target, previews a non-empty `Figure:` line, and inserts it above the image in one undoable action; note embeds, inline images, and protected note continuations offer no Figure action.
- [ ] Right-click the header, delimiter, first row, and a later row of a top-level Markdown table. Confirm each offers the same `Table:` action and inserts the previewed title above the table.
- [ ] Right-click inside a standalone display equation and top-level backtick/tilde fenced code block. Confirm Equation and Code actions insert above the complete object. Inline math/code and image/math/code inside table cells must not receive an independent caption action; a cross-reference inside a cell must still render normally.
- [ ] Enable Structural Tables Live Preview ownership for an ordinary table and a structural table with consecutive header rows. Right-click rendered cells and confirm the same `Table:` action appears in the owned menu and inserts above the complete source table. Verify above/below caption block widgets coexist with the owned table with both plugin load orders; disable or remove either plugin and confirm the other continues normally.
- [ ] Put lowercase caption keywords next to each target and confirm the menu repairs the existing keyword instead of duplicating it. Put a legacy Figure immediately below its carrier and confirm the menu moves it above without changing the carrier or its object ID. An adjacent caption of any type suppresses a second action, and an editor change while the dialog is open cancels confirmation without writing.
- [ ] Confirm caption creation never creates a block ID.
- [ ] For each caption type, switch visual placement above/below in Live Preview and Reading View. Confirm every bound caption is anchored directly to the carrier boundary with one compact theme-independent gap, including carriers followed by inline or standalone block IDs. Markdown bytes/hash/mtime must remain unchanged. Enter the caption with pointer and keyboard; the pill must disappear and exact source must reappear at its authored location. Source Mode must show exact Markdown.
- [ ] Enable the default image/Figure hover setting. Hover both the image and its caption and confirm the same structured title/content appears. Check wiki replacement text, Markdown alt, equal caption/alt deduplication, size-only aliases, filename-only fallbacks, caption-only, replacement-only inline/cell images, right-click dismissal, and the disabled state.
- [ ] Verify `@[[#Heading]]`, `@[[#Figure: Caption]]`, `@[[#^block-id]]`, and alias forms render as keyboard-focusable outline pills and navigate to the exact target line. With numbering off, the pill remains and omits only the number.
- [ ] Create a heading named `Figure: Same` and a caption `Figure: Same`; confirm the title reference fails closed. Repeat for duplicate headings and duplicate captions. Remove all but one candidate and confirm it resolves.
- [ ] Right-click a heading and caption and choose the single **Copy cross-reference** item. Existing block IDs must be reused without a write; missing IDs must show an exact preview, insert one collision-safe ID at the valid location (caption line or following heading line) after confirmation, and copy a readable aliased link. A stale source must cancel both the write and copy.
- [ ] Verify ordinary `[[#...]]`, cross-file links, missing targets, and duplicate headings/IDs remain unchanged; later ambiguity must not auto-rewrite existing title references.
- [ ] Confirm virtual heading numerals use compact filled pills, captions use filled pills, and references use outlined interactive pills in light/dark themes without relying only on color.
- [ ] Embed a numbered note into another note and confirm each file keeps independent caption counters and reference targets.
- [ ] Compose with an IME, reload, disable the plugin, and switch views; all replaced `@` markers and source syntax must remain recoverable and unchanged.
- [ ] Round-trip all four caption semantics on all four carrier types through the exact current DocWen MD → DOCX → MD candidate, with/without inline and following caption/object IDs and with wiki/Markdown image alt/size variants. Confirm semantic label, counter, bookmark, and reference follow the caption keyword while native image/table/equation/code structure follows the carrier. In particular, a multi-image Markdown table labeled `Figure:` must remain a native table, use `SEQ Figure` rather than `SEQ Table`, place the Figure caption below the table in DOCX, and return canonical caption-above-table Markdown. Changing Number Suite visual placement must not alter the round-trip source hash; ambiguity and unsupported candidates must fail closed rather than silently convert.

## Footnotes and endnotes

- [ ] Verify `[^id]` and `[^footnote:id]` display as footnotes and `[^endnote:id]` displays as an endnote.
- [ ] Mix both kinds in one file and confirm footnotes display `1`, `2`, `3`, endnotes display `E1`, `E2`, `E3`, and repeated references reuse their first number.
- [ ] Verify missing definitions, duplicate definitions, and conflicts such as `[^same]` plus `[^footnote:same]` remain unchanged.
- [ ] Put headings, captions, and `@[[...]]` references in definition continuations indented by two spaces and by a tab; none may enter their document counters.
- [ ] Confirm Live Preview and Reading View preserve native footnote navigation and definition-list structure while changing only visible labels.
- [ ] In Live Preview, switch between formatted numbers and original markers; click and keyboard-navigate to each formatted reference and definition, then edit the revealed source marker.
- [ ] Reload, switch views, and disable the plugin; original visible labels must return and Markdown bytes, mtime, definitions, references, and IDs must remain unchanged.
- [ ] Use a third-party renderer or deliberately mismatched rendered fixture; source/render count mismatches must fail closed without partial decoration.

## Multi-pane and lifecycle

- [ ] Open different notes in two panes with different Properties view modes.
- [ ] Open a pop-out window and verify styling and independent view state.
- [ ] Edit a heading to another heading of the same character length; decorations must update.
- [ ] Toggle `number-suite-show-virtual` and `number-suite-conceal-stored` without changing file length; both independent states must update immediately.
- [ ] Scroll a note with at least 2,000 headings and record editing latency.

## Parser safety

- [ ] YAML, backtick/tilde code fences, HTML comments/blocks, Obsidian `%%` comments, blockquotes, lists, and Setext headings remain unchanged.
- [ ] `3.14`, `2.0`, `2026`, dates, and unit quantities remain visible and are not removed by high-confidence cleanup.
- [ ] Wiki links, aliases, bold text, inline code, Emoji, CRLF, trailing hashes, BOM, and final newline are preserved.
- [ ] Multi-prefix headings appear clearly in preview.
- [ ] Prefixes produced by an active custom scheme and an archived pre-edit/pre-delete revision are both found by template cleanup; unrelated manual numbering remains unchanged.

## Source markers

Source markers are disabled by default. Before enabling them for a release claim:

- [ ] Verify Outline and Search display.
- [ ] Copy heading text and inspect it in an external editor.
- [ ] Copy a heading link, reload Obsidian, and navigate it.
- [ ] Test Unicode normalization and a formatter round-trip.
- [ ] Test malformed and one-sided markers; they must fail closed.
- [ ] Run the strip-marker command and verify visible numbers remain.

## Exact-title exclusions

- [ ] Add an exact exclusion to a copied custom scheme and verify the current-note match preview.
- [ ] Verify a heading-only exclusion does not consume a number and routes descendants through each skipped-level strategy.
- [ ] Verify a whole-section exclusion skips its descendants and numbering resumes at the surrounding level.
- [ ] Verify Live Preview, Reading View, write, renumber, current-note commands, and batch preview share the same exclusions.
- [ ] Verify a confirmed old prefix is removed from an excluded title while an ambiguous manual prefix is preserved with a warning.
- [ ] Verify inline formatting, similar-but-not-exact titles, code fences, YAML, comments, and duplicate rules fail safely.

## Batch recovery

- [ ] Use a temporary folder with at least ten notes and preview write, remove, and renumber.
- [ ] Change one file after preview; the entire batch must cancel.
- [ ] Apply a batch, then restore it; every file must be byte-identical to its original.
- [ ] Independently edit one applied file; restore must cancel without changing any file.
- [ ] Simulate a mid-batch error and confirm completed files roll back or remain recoverable from the pending snapshot.
- [ ] Edit an already-written file while a later batch write fails; rollback must preserve that edit and retain recovery.
- [ ] Excluded folders are not read into the preview and are not modified.
- [ ] `data.json` contains settings only; recovery data is stored in `recovery.json`, and failed setting writes remain visibly retryable.

## Themes and platform

- [ ] Test the default theme and at least one third-party theme.
- [ ] Test Windows desktop and one additional desktop platform before claiming cross-platform support.
- [ ] Test every platform claimed by the candidate. Keep emulator and physical-device results as
  separate evidence and do not infer one from the other.

## Android baseline

- [ ] Use an isolated Android 15 / API 35 emulator Vault and hash-verify the installed candidate.
- [ ] Open the sidebar from the ribbon, switch between Document outline and Current note, close and
  reopen it, change an override, and confirm tab/effective-value persistence without changing
  unrelated Properties.
- [ ] In Document outline, navigate H1-H9 and all four caption types, collapse and expand sections,
  and verify tab, row, and collapse controls have at least 44-pixel touch height with no clipping or
  horizontal drift at phone width.
- [ ] In Live Preview, verify virtual numbers, stored-number concealment, cursor reveal, selection,
  copy, and Chinese IME composition. Switch to Reading View and confirm the same numbering model.
- [ ] Preview and apply a current-note write, then undo and redo once. Run cleanup and confirm the
  original Markdown is restored without changing unrelated content.
- [ ] Open all seven settings tabs at phone width, change one setting, reload the plugin, and confirm
  persistence without clipped controls or hover-only actions.
- [ ] Background and foreground Obsidian, switch notes, disable and re-enable the plugin, and confirm
  there is no stale decoration, plugin error, crash, or ANR.
- [ ] Record physical Android separately when it is available. It is optional enhanced evidence,
  never a prerequisite of the shared mobile release gate. Missing physical-device evidence remains
  visible as unverified and cannot be inferred from emulator evidence.

## Acceptance record

Record evidence here or in a release issue:

```text
Plugin commit:
Artifact SHA-256:
Obsidian version:
Operating system:
Vault path/type:
Automated gate:
Manual cases passed:
Known limitations:
Accepted by/date:
```
