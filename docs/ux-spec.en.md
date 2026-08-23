---
doc_id: ux-spec
language: en
source_language: zh-CN
translation_of: ux-spec.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-08-23
---

# UX specification

[中文规范源](ux-spec.zh-CN.md)

<!-- section: authority -->
## Document authority

The Chinese document is the normative source for interaction and copy behavior. This file is the
synchronized English translation. Screenshots and historical acceptance records prove only their
version and do not override this specification.

<!-- section: principles -->
## Interaction principles

- Always distinguish source-file state from visual state in Obsidian.
- Show itemized results and risks before any file modification.
- Keep defaults conservative; preserve ambiguous text and explain why.
- Keep global, current-note override, and effective values distinguishable.
- Keep mobile, narrow-window, keyboard, and touch operation accessible without hover dependence.

<!-- section: entry-points -->
## Entry points

The ribbon icon and command palette open current-note controls. The command palette also offers
source-appearance restore, independent virtual/conceal toggles, current-note write/remove/renumber,
source-marker removal, batch processing, and latest-batch undo. Current-note actions are unavailable
without an active Markdown note and must show a clear notice.

<!-- section: current-note-panel -->
## Current-note panel

The panel first shows note name and path, then a Setting / Global / Current-note override / Effective
summary for virtual display, concealment, scheme, and full ignore. Display and concealment use
Follow global / On / Off tri-state controls. Scheme selection shows available names and never
requires internal IDs.

Follow global deletes the relevant Property. Restore all deletes every plugin override while
preserving unrelated Properties. After a successful write, the panel exits its busy state, rereads
Properties, and immediately refreshes Live Preview and Reading View. Read failure blocks blind
writes and offers retry.

<!-- section: settings-experience -->
## Global settings experience

Settings use seven consistent tabs: General, Heading numbering, Captions, Cross references,
Notes, Write and cleanup, and Display and batch. Built-in schemes can be expanded
and copied to custom schemes. A custom scheme provides name, base level, live H1-H6 template
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

A recognized caption visually changes from `Figure:` to `Figure 1:` (and equivalently for Table,
Equation, and Code) without editing source. An explicit semantic reference visually replaces only
its leading `@` with the resolved number and a space, preserving the native Obsidian link text,
alias, click behavior, and target. If the target is missing, duplicated, cross-file, or lacks a
visible valid number, the complete source rendering stays unchanged. Composition removes all
semantic decorations, and plugin cleanup restores every replaced `@`.

Footnotes and endnotes display separate per-file numbers assigned in first-reference order;
repeated references reuse their first number. Decorations replace only visible reference and
definition labels while preserving Obsidian's native links, list structure, and source. Missing,
duplicate, or canonically conflicting definitions and rendered-node count mismatches stay
unchanged; reprocessing and plugin cleanup restore original labels and list values.

<!-- section: accessibility-and-mobile -->
## Accessibility and mobile

Virtual decorations are hidden from assistive semantics while stored content remains accessible.
Controls have text labels, keyboard focus, and reasonable touch targets; summaries can reflow on
narrow screens without dropping fields. Mobile claims require dated evidence for that version, and
emulator results cannot be described as physical-device acceptance.

<!-- section: error-recovery -->
## Errors and recovery

Failed settings saves retain the pending snapshot. A failed batch rolls back only files that still
exactly match plugin output and retains usable recovery. Concurrent edits, corrupt recovery data,
or host-rendering differences fail closed and cannot be hidden behind a success notice.
