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

- [ ] Click the ribbon icon and confirm it opens the current-note panel without changing the note or global settings.
- [ ] Confirm the panel names the active note and shows global, current-note override, and effective values.
- [ ] Set virtual display and concealment independently through Follow global / On / Off; re-open the panel and verify persistence and effective display.
- [ ] Choose a built-in and a custom scheme from the panel without typing an ID; Follow global must delete the scheme property.
- [ ] Enable note ignore, then restore all to Follow global; verify all plugin Properties are removed and unrelated Properties remain byte-for-byte equivalent.
- [ ] In Live Preview, show virtual numbers for an unnumbered note and confirm the file hash and mtime do not change.
- [ ] Switch to Reading View and confirm numbering continues correctly across rendered sections.
- [ ] Write numbers to the current note, inspect the preview, apply, then undo and redo once.
- [ ] Conceal the stored numbers, move the cursor into each heading, select across a prefix, copy, and use a Chinese IME.
- [ ] Enable virtual numbers and concealment together; each recognized stored prefix must be replaced by exactly one virtual number in Live Preview and Reading View.
- [ ] Reload and disable the plugin; confirm source text remains accessible and Reading View DOM decoration disappears.

## Captions and same-file references

- [ ] Verify `Figure:`, `Table:`, `Equation:`, and `Code:` each start at 1 and increment independently; `Listing:` remains unchanged.
- [ ] Verify captions without IDs are numbered and captions with inline or immediately following user-authored block IDs receive the same behavior.
- [ ] Confirm Live Preview and Reading View show `Figure 1:`-style labels while the Markdown bytes, mtime, and IDs remain unchanged.
- [ ] With caption numbering off, confirm Figure and Equation default to centered while Table and Code follow the theme; toggle all four independently in both Live Preview and Reading View.
- [ ] Verify `@[[#Heading]]`, `@[[#^block-id]]`, and both `|alias` forms retain native link navigation and add a number only when the target has a visible valid number.
- [ ] Verify ordinary `[[#...]]`, cross-file links, missing targets, duplicate headings/IDs, and unnumbered headings remain unchanged.
- [ ] Embed a numbered note into another note and confirm each file keeps independent caption counters and reference targets.
- [ ] Compose with an IME, reload, disable the plugin, and switch views; all replaced `@` markers and source syntax must remain recoverable and unchanged.

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
- [ ] Open the current-note panel from the ribbon, change an override, close and reopen the panel,
  and confirm the effective values persist without changing unrelated Properties.
- [ ] In Live Preview, verify virtual numbers, stored-number concealment, cursor reveal, selection,
  copy, and Chinese IME composition. Switch to Reading View and confirm the same numbering model.
- [ ] Preview and apply a current-note write, then undo and redo once. Run cleanup and confirm the
  original Markdown is restored without changing unrelated content.
- [ ] Open all seven settings tabs at phone width, change one setting, reload the plugin, and confirm
  persistence without clipped controls or hover-only actions.
- [ ] Background and foreground Obsidian, switch notes, disable and re-enable the plugin, and confirm
  there is no stale decoration, plugin error, crash, or ANR.
- [ ] Record physical Android separately when it is available or when a change materially affects
  touch, IME, storage, or platform boundaries. Missing physical-device evidence must remain visible
  but does not convert emulator evidence into a failure.

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
