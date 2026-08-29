---
doc_id: ux-spec
language: en
source_language: zh-CN
translation_of: ux-spec.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-08-29
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
- Show itemized results and risks before any file modification.
- Keep defaults conservative; preserve ambiguous text and explain why.
- Keep global, current-note override, and effective values distinguishable.
- Keep mobile, narrow-window, keyboard, and touch operation accessible without hover dependence.

<!-- section: entry-points -->
## Entry points

The ribbon icon opens a persistent right sidebar and preserves its last selected tab. The dedicated
outline command selects Document outline; Open current note controls selects Current note. The
command palette also offers source-appearance restore, independent virtual/conceal toggles,
current-note write/remove/renumber, source-marker removal, batch processing, and latest-batch undo.
Current-note actions are unavailable without an active Markdown note and must show a clear notice.

<!-- section: current-note-panel -->
## Number Suite sidebar

The sidebar contains two internal tabs, Document outline and Current note. Document outline is the
default for a newly created view. It follows the active Markdown note and shows nested native H1-H6,
Number Suite/DocWen H7-H9 extension headings, and Figure/Table/Equation/Code captions. It uses the
same effective per-note numbering and concealment plan as the editor, strips authored block IDs from
labels, supports collapsing sections, and navigates by source line without rewriting Markdown.
Captions are children of the deepest preceding heading, or roots before any heading.

The two sidebar tabs have equal width and span the sidebar. Inactive tabs use muted text; the active
tab combines semibold text with a bottom accent line. Hover uses a quiet background, while keyboard
focus uses a visible inset ring that preserves the active line. Tabs use `tablist`, `tab`, `tabpanel`,
`aria-controls`, `aria-labelledby`, and roving tabindex. Left/Right, Home, and End work, RTL follows
visual direction, and switching keeps the active tab visible and focused.

The Current note tab first shows note name and path, then a Setting / Global / Current-note override /
Effective summary for virtual display, concealment, scheme, and full ignore. Display and concealment
use Follow global / On / Off tri-state controls. Scheme selection shows available names and never
requires internal IDs. Selecting the sidebar must not make the targeted editor ambiguous: a
file-changing action resolves the one open editor for that note and fails closed if zero or multiple
matching editors exist.

Current-note content uses quiet grouped surfaces for each effective-value set, with subdued section
labels, whitespace, and effective-value emphasis instead of stacked full-width dividers. Its helper
note is compact and has no accent border in the sidebar. Loading uses a separate text-labelled status
indicator and stops rotating when reduced motion is preferred.

Follow global deletes the relevant Property. Restore all deletes every plugin override while
preserving unrelated Properties. After a successful Property write, the tab exits its busy state,
rereads Properties, and immediately refreshes Live Preview, Reading View, and the outline. Read
failure blocks blind writes and offers retry. Markdown-changing actions continue to open the
separate itemized preview modal; batch selection and global settings remain separate destinations.

<!-- section: settings-experience -->
## Global settings experience

Settings use seven consistent tabs: General, Heading numbering, Captions, Cross references,
Footnotes & endnotes, Write and cleanup, and Display and batch. The active tab combines an accent
underline with a semibold label, and stable space separates the baseline from the content panel. Built-in schemes can be expanded
and copied to custom schemes. A custom scheme provides name, base level, live H1-H9 template
previews, and exact exclusions. Empty templates display “This level is not numbered.” Invalid
non-empty semantics block save with a comprehensible constraint message.

Frequent changes may be coalesced, but the UI exposes saving, failure reason, and retry. It cannot
present an unpersisted value as saved.

<!-- section: previews-and-warnings -->
## Previews and warnings

Current-note and batch previews identify file, line, before/after text, recognition provenance, and
warnings. A stale preview cancels as a whole. Ambiguous or multiple prefixes, empty headings,
missing parents, and unsupported prefixes explain why no modification occurs. Stored operations
warn about heading-link risk.

<!-- section: display-behavior -->
## Display behavior

Virtual numbers appear before heading text but do not enter copied text or editable source ranges.
When stored numbers are concealed, a cursor or selection touching the heading line reveals source;
decorations are removed during IME composition. Reading View does not partially guess when source
and rendered heading count or levels differ.

In Live Preview, authenticated H7-H9 extension lines receive heading styling and hide their hash
marker only while the line is not selected and no IME composition is active. Reading View treats
an extension line as a heading only when it maps to its own rendered paragraph; otherwise the
section stays unchanged. Source Mode keeps the extension marker visible by default. UI copy must
identify these levels as a Number Suite/DocWen extension, not native Obsidian headings, and should
recommend a stable block ID for interoperation.

A recognized caption visually changes from `Figure:` to `Figure 1:` (and equivalently for Table,
Equation, and Code) without editing source. Caption alignment is independent from numbering and has
one centering toggle per fixed type. Figure and Equation default to centered; Table and Code default
to following the theme. An explicit semantic reference visually replaces only
its leading `@` with the resolved number and a space, preserving the native Obsidian link text,
alias, click behavior, and target. If the target is missing, duplicated, cross-file, or lacks a
visible valid number, the complete source rendering stays unchanged. Composition removes all
semantic decorations, and plugin cleanup restores every replaced `@`.

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

Virtual heading and caption decorations are hidden from assistive semantics while stored content
remains accessible. Formatted note labels expose their note type and number. Sidebar tabs, outline
rows, collapse controls, and action buttons have consistent alignment, keyboard focus, and at least
44-pixel touch height on coarse-pointer devices; summaries reflow on narrow screens without dropping
fields. Emulator results cannot be described as physical-device acceptance.

<!-- section: error-recovery -->
## Errors and recovery

Failed settings saves retain the pending snapshot. A failed batch rolls back only files that still
exactly match plugin output and retains usable recovery. Concurrent edits, corrupt recovery data,
or host-rendering differences fail closed and cannot be hidden behind a success notice.
