---
doc_id: ux-spec
language: en
source_language: zh-CN
translation_of: ux-spec.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-11-17
---

# Number Suite — UX specification

[中文规范源](ux-spec.zh-CN.md)

<!-- section: authority -->
## Document authority

The Chinese document is the normative source for interaction and copy behavior. This file is the
synchronized English translation. Screenshots and execution evidence do not override this
specification.

<!-- section: principles -->
## Interaction principles

- Always distinguish source-file state from visual state in Obsidian.
- Show itemized results and risks before heading transformations. Explicit note-Property changes save directly and expose persistence status.
- Keep defaults conservative; preserve ambiguous text and explain why.
- Keep global, current-note override, and effective values distinguishable.
- Keep mobile, narrow-window, keyboard, and touch operation accessible without hover dependence.

<!-- section: entry-points -->
## Entry points

The ribbon icon directly opens the Current note sidebar. Legacy commands and workspace states migrate compatibly. Native Outline and Current note provide source-bound mind-map entries; the command follows the active note. The command palette also offers source-appearance
restore, independent virtual/conceal toggles,
current-note write/remove/renumber, source-marker removal, batch processing, and latest-batch undo.
Current-note actions are unavailable without an active Markdown note and must show a clear notice.

<!-- section: current-note-panel -->
## Number Suite sidebar

## Native Outline and structure editing

Enable Obsidian's core Outline plugin first; Number Suite never enables it automatically and provides guidance when unavailable. The ribbon opens Current note directly. The former Document outline has been removed; legacy commands, shortcuts and workspace states migrate to the current entries.

General provides a default-on Enhance native Outline switch. Turning it off removes enhancements and the map entry while retaining preferences, without enabling core Outline. Its toolbar Display options menu has four shared persistent choices: heading numbers, heading levels when unnumbered, H7–H9, and captions. These affect Outline only; existing saved off values remain off. Each heading shows one number pill, or a neutral H1–H9 pill when no number is shown and level display is enabled. Hover identifies its level. Caption leaves keep their type icon, localized ordinal and secondary title, without pills or expand arrows. Native navigation and effective body numbering remain unchanged.

H7–H9 dragging moves a complete section, including prose, captions and descendant headings, only among same-parent, same-level headings. An insertion marker identifies the destination. Changed source is rejected; one bounded editor transaction supports native Undo/Redo. Captions cannot move independently, and H1–H6 native operations stay available.

The native Outline toolbar and Current note header open the heading map for their own source file, retaining that binding across focus changes. The command follows the active note. The map browses without writing until Adjust structure is explicitly enabled. That mode supports same-parent, same-level whole-section dragging and Move section up/down buttons. Invalid destinations do not write and retain a concise local reason after release; canceled and unchanged moves stay quiet. Adjust structure has a visible mode label, always-visible move controls, highlighted targets and before/after insertion lines. A matching Markdown editor and unchanged snapshot are required. Reordering never changes heading levels, rewrites numbers or retargets links. Desktop and Android touch dragging require real-host evidence independently of button access.

The heading mind map connects H1-H9 headings to a virtual document root. The root displays the
basename, a file icon instead of a heading number, and the direct top-level heading count. It remains
visible without headings and never merges with a same-name H1. Every parentless heading attaches
to it, including an initial H2. Root body navigation opens the file top. Subtree scope uses the
selected heading as root; the file-name breadcrumb returns to the document. Initially, two structural
heading depths are visible at 100% scale; deeper branches are collapsed. Clicking the zoom percentage
restores 100%. These presentation defaults never change Markdown or reset expansion on later edits.

The map projects headings only: captions are neither shown nor counted as child
headings. Its default layout runs left to right, connecting a parent's right side to each child's
left side. A card's left handle first shows the virtual number that is actually visible; when there
is no virtual number, it may show a reliably recognized visible stored number within the current
recognition scope; otherwise it shows Hn. The right arrow shows the direct-child count and toggles the branch; leaves show neither an arrow nor zero. A skipped-level heading attaches directly to the nearest preceding
shallower heading without creating synthetic nodes.

The mind map supports whole-document and Selected subtree scopes, 1/2/3/all structural-depth
expansion, left-to-right and top-to-bottom layouts, title/number search, Fit, empty-space panning,
Ctrl/Cmd-wheel zoom around the pointer, and two-finger pinch zoom. Search may temporarily reveal the
ancestors needed for matches, but must not alter structural counts or the user's session collapse
intent; clearing search restores the session collapse state. Enter and Shift+Enter traverse matches
in document order while a compact status reports the current and total match count. If the selected
match becomes hidden, its nearest visible ancestor takes its selection and screen position. Click
selects a card; double-click or Enter on its body navigates to the exact source line. Edits to the
current note may refresh the map without resetting selection, branch collapse, or the viewport for
that same document. The view normally browses without writing. Explicit Adjust structure mode permits only guarded same-parent, same-level whole-section moves with native Undo/Redo.

Ordinary wheel input pans; Shift-wheel pans horizontally. The map surface accepts + and - for zoom
and 0 for Fit. Canvas translation is independent of
scroll boundaries, and collapsing a branch preserves the clicked parent's screen position. Fit
centers the visible tree. Search handles describe the effective visible state; toggles on a
search-revealed ancestor last only for that query and leave the saved collapse intent unchanged.
Narrow toolbars wrap, and keyboard focus reveals off-screen cards. Touch supports blank-canvas
panning, zoom buttons, and two-finger pinch zoom.

The compact Current note panel shows the note name (full path in its tooltip) with automatic Following global / Customized N settings / Disabled for this note status. Virtual numbers, stored-number visibility and scheme each inherit or override independently; inherited choices show the global value. Stored-number visibility maps inversely to concealment. Display & numbering starts selected and the sidebar remembers the selected tab for its open session. The header menu disables the note while retaining choices, or restores all Number Suite overrides to global settings. Starting and skip rules are collapsed, with existing rules visible and H1–H9 rules added on demand. Each choice can return to inheritance. Edit note text contains write, renumber and clean-up actions, with source marker and multi-file actions below. Global settings have a separate footer entry. Normal saved status takes no extra space; pending saves, invalid YAML, conflicts and save failures remain visible. Secondary descriptions use help tooltips, and narrow controls wrap without horizontal overflow. File actions require one matching editor and fail closed for zero or multiple matches.

Layout and expansion depth use secondary View options; range, search and zoom stay primary. Cards use light borders and backgrounds, a single number-or-level pill and consistent hover, selection and focus. Move buttons and insertion targets appear only in Adjust structure mode.

Follow global deletes the relevant Property. Restore all deletes every plugin override while
preserving unrelated Properties. After a successful Property write, the tab exits its busy state,
rereads Properties, and immediately refreshes Live Preview, Reading View, and the outline. Read
failure blocks blind writes and offers retry. Single-note Markdown actions, including commands, open an itemized preview within Edit note text. It fixes the target filename and change count, provides Back/Cancel/Apply, and retains warnings and incremental loading. The target and action area stay visible while differences scroll independently. Switching the active note or the sidebar tab retains the preview and its original target; a stale refusal disables Apply until a fresh preview is built. Back, Cancel and successful Apply restore the Edit note text action list. Batch selection and previews remain wide modals; scheme editing stays in global settings.

<!-- section: settings-experience -->
## Global settings experience

Settings use seven consistent tabs: General, Heading numbering, Captions, Cross references,
Footnotes & endnotes, Write and cleanup, and Display and batch. The active tab combines an accent
underline with a semibold label, and stable space separates the baseline from the content panel. Built-in schemes can be expanded
and copied to custom schemes. A custom scheme provides name, base level, live H1-H9 template
previews, and exact exclusions. Built-in and custom-template previews share a heading-number
pill followed by a localized “Heading” label, with **all example counters set to 1**
(`1`, `一`, `A`, `a`, `1.1` as their templates dictate); these samples never change
real note counters or starting values. Placeholder help explains `{2.arabic}` without
an unexplained “→ 3” marker. Empty templates display “This level is not numbered.” Invalid
non-empty semantics block save with a comprehensible constraint message.

Frequent changes may be coalesced, but the UI exposes saving, failure reason, and retry. It cannot
present an unpersisted value as saved.

Current-note numeric fields retain input locally until blur or Enter commits a valid value. Invalid
input has a visible inline explanation and never schedules a write. Per-level controls are expandable.
Failed committed drafts survive note and pane switches. Retry merges independent setting edits;
divergent edits to one setting show both values and require an explicit decision to apply the draft.
Discard and reload remains available even when external Properties are invalid.

<!-- section: previews-and-warnings -->
## Previews and warnings

Current-note and batch previews identify file, line, before/after text, and
warnings. A stale preview cancels as a whole. Ambiguous or multiple prefixes, empty headings,
missing parents, and unsupported prefixes explain why no modification occurs. Stored operations
warn about heading-link risk.

Each file has a native disclosure summary with its change and warning counts. The first file opens initially; other bodies render on expansion. Pagination belongs to each file. Only the changed numbering substring is emphasized; unchanged heading text stays neutral and Before/After labels remain visible.

Warning-only files appear in the preview but never enter the write or recovery set. Changes and
warnings can be expanded until every result is visible. Normal diagnostics use localized reasons,
not internal rule identifiers.

<!-- section: display-behavior -->
## Display behavior

Virtual numbers appear before heading text but do not enter copied text or editable source ranges.
When stored numbers are concealed, a cursor or selection touching the heading line reveals source;
during IME composition only the active heading reveals source, while unrelated heading decorations
remain visible. Reading View does not partially guess when source and rendered heading count or
levels differ.

In Live Preview, authenticated H7-H9 extension lines receive heading styling and hide their hash
marker only while the line is not selected and no IME composition is active. Reading View treats
an extension line as a heading only when it maps to its own rendered paragraph; otherwise the
section stays unchanged. Source Mode keeps the extension marker visible by default. UI copy must
identify these levels as a Number Suite/DocWen extension, not native Obsidian headings, and should
recommend a stable block ID for interoperation.

A recognized caption becomes one wrapping filled pill and visually changes from `Figure:` to
`Figure 1:` when numbering is on (and equivalently for Table, Equation, and Code) without editing
source. Caption alignment is independent from numbering and has
one centering toggle per fixed type. Figure and Equation default to centered; Table and Code default
to following the theme. Caption kind supplies the semantic label and counter, while any adjacent
standalone image, table, display equation, or fenced code block may be the carrier. Zero or one blank
line may separate them; two blank lines and either-side ambiguity leave the caption unbound. Each
fixed type also has an independent above/below visual placement, defaulting above. Every bound
caption uses the same carrier anchor and compact theme-independent gap. New captions are authored
above their carriers, but display never rewrites existing source. An active caption reveals its exact
source at its authored location; Source Mode always shows Markdown. An active reference reveals only
its own source token. Touch and IME editing use the same local reveal rule, so inactive captions and
references remain as pills.

In editing mode, the context menu offers Figure on a standalone image, Table on any row of a
top-level Markdown table, Equation on a standalone display equation, and Code on a top-level fenced
code block. It resolves the actual pointer target before falling back to the cursor. The same action appears in a Structural Tables-owned menu only after its file, exact source text and visual range are verified. An unavailable or outdated provider snapshot has a disabled explanation directing the user to Source mode; it never falls back to a different table ordinal. The dialog
prefills a safe image-title suggestion when available, shows the exact stored caption preview, and
keeps confirmation disabled for an empty title. All new captions go above their objects; a legacy
Figure immediately below its image offers a move-above repair. A nearby case-only keyword mismatch
changes to a repair action, and an adjacent caption of any type removes the action. Inline and table-cell
images, math, and code are ineligible. Caption creation never creates an ID. Existing inline and standalone block IDs remain attached to their caption when it is repaired or moved.

The default-on image/Figure hover setting applies the same structured tooltip to a bound image and
caption: rendered caption title first, meaningful replacement/alt text second. Equal values collapse
to one line; dimensions and filename-only fallbacks are omitted. Inline and cell images may expose
replacement text only.

An explicit semantic reference replaces its complete visual source with an interactive outline pill.
The pill contains the alias or target title plus a visible target number when one exists; it remains
a pill when numbering is off. Heading and complete typed caption names share one same-file ambiguity
space, and missing, duplicate, ambiguous, or cross-file targets stay unchanged. A pill click or
keyboard activation navigates to the exact source target. Composition and a selection touching the
reference restore that reference's editable source without hiding unrelated pills. Plugin cleanup
restores the leading `@`, native link text, ARIA, and target metadata.

The heading/caption context menu contains one **Copy cross-reference** item. An existing target block
ID copies immediately. A missing ID opens a focused before/after preview; confirmation performs one
stale-checked insertion at the target's valid position (inline for captions, following for headings)
and then copies a readable alias link. There is no submenu and
no automatic migration of title references.

Footnotes display `1`, `2`, `3` and endnotes display `E1`, `E2`, `E3`, using separate per-file
counters assigned in first-reference order; repeated references reuse their first number. Live
Preview offers formatted numbers or original markers. Clicking or moving the cursor to a formatted
number reveals the editable source marker. Reading View preserves native link navigation.
Decorations replace only visible reference and definition labels while preserving Obsidian's native
links, list structure, and source. Missing, duplicate, or canonically conflicting definitions and
rendered-node count mismatches stay unchanged; reprocessing and plugin cleanup restore original
labels and list values.

<!-- section: accessibility-and-mobile -->
## Accessibility and mobile

Virtual heading numerals and generated caption numerals are hidden from assistive semantics while
stored caption content remains accessible. Reference pills expose link semantics, visible text,
keyboard focus, and a non-color-only outline treatment. Formatted note labels expose their note type
and number. Outline rows, collapse controls, heading-map card bodies and interactive
handles, and action buttons expose visible keyboard focus; interactive controls have at least
44-pixel touch height on coarse-pointer devices. Heading-map selection and search matches cannot be
communicated by color alone, and a zero-child handle must not pretend to be actionable. Summaries
reflow on narrow screens without dropping fields. Emulator results must not be presented as physical-device acceptance.

<!-- section: error-recovery -->
## Errors and recovery

Failed settings saves retain the pending snapshot. A failed batch rolls back only files that still
exactly match plugin output and retains usable recovery. Concurrent edits, corrupt recovery data,
or host-rendering differences fail closed and cannot be hidden behind a success notice.


Long syntax tutorials and examples use lightweight native details, while concise context and operation risks stay visible. Their expansion state lives only for the current settings-window session: switching tabs preserves it, closing clears it, and toggling never saves plugin settings. Keep seven tabs with Links & references and Display & appearance; move batch-only controls into Write and cleanup and put Reset at the end of General. Current note's Starts & skips section defaults closed with no overrides and automatically shows the configured rule count otherwise.
