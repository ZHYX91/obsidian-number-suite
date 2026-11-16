---
doc_id: navigation-target
language: en
source_language: zh-CN
translation_of: navigation-target.zh-CN.md
translation_status: synced
status: target
last_synced: 2026-11-16
---

# Number Suite — Navigation and structure-editing target

[中文规范源](navigation-target.zh-CN.md) · [Documentation index](README.md)

<!-- section: authority -->
## Scope and status

This document records the approved navigation direction and defaults. It does not claim that every
feature is implemented or accepted in the host. Chinese is the normative source; this is its synchronized
translation. As each feature lands, update the corresponding product, UX, architecture, testing and usage
contracts so that target and current-behavior documents do not become competing authorities.
Implementation status, candidate identities, execution logs and missing evidence belong in the relevant
PR, not in this document.

The final division is: the enhanced native Outline provides compact everyday navigation; the independent
heading mind map provides graphical structure browsing and staged structure editing; the Number Suite
sidebar provides current-note configuration, diagnostics and explicit numbering file operations.
The plugin-owned Document outline is retained only during migration, not developed as a permanent
full replacement for native Outline.

<!-- section: defaults -->
## Defaults and persistence

| Feature | New installation or missing setting | Scope |
| --- | --- | --- |
| Enhance ordinary same-file Wiki heading links | Off | Only ordinary Wiki links reliably resolved to a heading in the current note |
| Show numbers in native Outline | On | Use the current note's effective numbering display result |
| Show H7–H9 in native Outline | On | Include valid extended headings from this note |
| Show captions in native Outline | On | Include Figure, Table, Equation and Code navigation items |
| Heading mind-map entry points | Visible | Provide entry points without automatically opening the map |

Persist these choices independently. An explicitly saved false is not a missing value; upgrades, reloads
and workspace restoration must not re-enable a choice the user turned off. “Everything else on” does
not change unrelated existing defaults such as editor virtual numbers, source markers, Source Mode or
file writes. Continue respecting per-note opt-out and existing numbering rules.

Outline enhancement is a separate global settings tab with the three Outline toggles, without a redundant
master toggle. Ordinary Wiki enhancement belongs in Cross references, not Outline settings. Every visible
toggle must have a working consumer, immediate refresh, save-failure feedback and a reversible disabled
state. Do not ship empty toggles that only draw controls or persist unused fields.

Default-on does not silently enable the core Outline plugin, open or move panes, create Properties or
rewrite notes. Explain when native Outline is disabled or its adapter is unavailable; retain the independent
map command and current-note entry. Make the default-off Wiki enhancement discoverable through its
settings description and a one-time feature introduction, not repeated popups or a permanent reminder.

<!-- section: references -->
## Reference display and editing

A rendered explicit `@[[...]]` reference navigates on one click, without a reveal-source, move-away and
click-again sequence. Moving the text caret into a reference by keyboard reveals its complete source;
clicking already exposed source places the caret rather than forcing navigation. Preserve selections,
IME composition, context menus and drags starting in surrounding prose. Restore rendered display after
editing leaves the range. Validate exact boundary behavior against the host; mouse hover is not caret
entry. Provide a discoverable source-editing path; mobile cannot rely only on desktop arrows or modifiers.

Ordinary Wiki heading enhancement is a separate display projection. It does not add ordinary links to the
explicit semantic-reference export protocol. Off preserves all native behavior. On supports `[[#Heading]]`
and `[[Current file#Heading]]` when the latter reliably resolves to this file, preserving aliases such as
`[[#Heading|Alias]]`. Same-file classification uses actual resolved file identity, never a basename suffix,
the active pane, or merely whether the string starts with `[[#`.

Use the target heading's effective display number, not another counter. Preserve native rendering and
navigation when the target or source position is uncertain, no effective number is available, or the target
is missing or ambiguous. Do not replace native path resolution with looser title matching. Reuse existing
protection for code, comments, math and link metadata; retain adjacent prose, UTF-16 offsets and aliases.

Cross-file heading links remain native and gain no number. Do not implicitly take over ordinary block
links, embeds or standard Markdown links. Cross-file numbering requires a separate design and would
have to use the target note's effective number, never the source note's scheme. Existing explicit references
retain their established heading, caption and block-ID rules.

<!-- section: native-outline -->
## Native Outline enhancement

Adapt the native view using existing document parsing and numbering results. Do not overlay a separate
plugin tree, pollute the application's shared heading index to display captions, or write Markdown.
Navigable H7–H9 in Outline does not imply native links, backlinks or other plugins gain extended-heading
support.

Bind numbers to file, source location and current text identity. Search, collapse, duplicate titles, skipped
levels and temporarily stale caches must not misassign numbers; never pair numbers by visible-row ordinal.
Retain native heading entries outside the plugin's numbering scope. Do not duplicate stored numbers,
force editor numbering on, or bypass per-note opt-out. Invalid configuration leaves ordinary native
navigation available rather than fabricating extra numbers.

Recognize H7–H9 through the existing exact extension rules, preserving true level and source position.
Captions are navigation items within their containing section, not sections, heading counters or parents
of later headings. Disabling any Outline option does not change editor, map or export semantics. With
all three disabled, restore native entry presentation.

Preserve native search, collapse, navigation, following, preview and ordinary section reordering. Added
items must not automatically inherit file-changing operations: until implemented and validated safely,
extended headings and captions are navigation items, with unsafe dragging and drop targets disabled.
Moving ordinary sections must preserve their complete source ranges, unaffected by synthetic captions.
Searching by virtual number and other native interactions for added entries require separate validation;
rendering an item is not proof that it inherits every interaction.

Check host capabilities, bound adaptation to the relevant view and make it fully reversible. Disable,
reload and unload remove only this plugin's nodes, events and wrappers without corrupting native or
other-plugin-owned objects. An incompatible capability disables only the affected enhancement with an
understandable status, not native Outline itself. Avoid duplicate decoration alongside other numbering
or extended-heading plugins.

<!-- section: map-and-sidebar -->
## Map entry points and sidebar migration

The recommended primary entry is native Outline's toolbar, with a fallback in the current-note header;
the independent command and existing user shortcuts remain available. Buttons do not depend on the
three Outline display choices, displace native controls or auto-open the map. Do not create a map tab or
another default ribbon icon. When toolbar adaptation is unavailable, other entries continue to work.

Opening from a panel uses that panel's actual file and source pane, not an arbitrary active file. Validate
multiple panes and pinned or linked panels. Reuse existing localization for buttons and failures, and keep
entries discoverable and operable on mobile.

After native enhancement reliably covers existing navigation and entry migration is accepted, remove
Document outline and the sidebar's internal tab bar. Display current-note configuration, effective values,
diagnostics, write and cleanup actions directly. Migrate old commands and workspace state while retaining
shared models used by the map, numbers and references. Do not remove the only H7–H9 or caption
navigation before its replacement works, or use the transition to justify permanently developing two
complete outlines.

<!-- section: structure-editing -->
## Mind-map structure editing

The first stage adds only same-file, same-parent section reordering. Move the complete heading subtree
and its body without changing heading levels. A later stage can add reparenting and level changes while
preserving relative subtree levels and rejecting H9 overflow, ancestry cycles and uncertain targets.
The map retains headings as structural nodes; captions do not become child headings.

The recommended interaction explicitly separates browsing from Adjust structure. Browsing keeps its
existing pan, zoom, selection, collapse and navigation gestures. Editing shows a clear proposed drop
location. Cancellation, invalid targets, read-only state and stale source do not write. Touch pan, pinch,
long-press and structure dragging must not trigger one another accidentally; the start gesture needs
host validation.

Each structure operation uses an immutable bounded plan and revalidates file, editor and source before
commit. The visible drop preview serves as the operation preview in this dedicated mode; document this
variant explicitly in the write contracts. One successful drag is one complete undo/redo unit, including
when only the map is open. A mode toggle never replaces source validation or recovery.

Prefer moving exact source ranges, retaining prose, code, tables, images, block IDs, notes, line endings
and unrelated text. Explicitly check caption/object bindings across section boundaries, duplicate headings
and nested heading paths. Do not promise all existing links are unaffected or guess vault-wide rewrites.
Virtual numbers refresh after movement. Stored number text moves unchanged; actual renumbering
remains a separate preview-and-confirm operation.

<!-- section: acceptance -->
## Functional acceptance

| Area | Required behavior coverage |
| --- | --- |
| Defaults and saves | New installation, old data missing keys, explicit true/false, save failure/retry, reload, per-note opt-out |
| References | First click, aliases, keyboard entry/exit, Source Mode, drag selection, IME, touch/long-press, missing/ambiguous targets, native cross-file controls |
| Outline | All eight toggle combinations, consistent numbers, stored prefixes, duplicate/skipped-level headings, filtering/collapse, caption parents, empty notes, invalid configuration |
| Host lifecycle | Minimum supported and current versions, multiple panes, file switches, Outline disable/reopen, plugin reload/unload, conflicting plugins, long notes |
| Structure writes | Exact before/after source, complete undo/redo, dirty editors, multipane/external conflicts, cancellation, caption/object boundaries, read-only refusal |

Pure logic, mocked DOM, real browser, packaged artifact and actual Obsidian behavior are distinct evidence.
A successful build or browser fixture does not replace desktop and Android host acceptance. Never label
unexecuted tests as passed. Feature copy and usage guidance must distinguish implemented behavior from
capabilities that remain unverified.

<!-- section: delivery -->
## Delivery boundaries

Reference interaction, ordinary same-file Wiki enhancement, native Outline enhancement, old-view
migration and mind-map editing may ship separately rather than in one release. Retiring the old outline
does not wait for every map-editing feature, but does wait for accepted navigation replacement and entry
migration. Defaults ship with their actual functional consumers, not as a batch of empty toggles.

This target does not authorize merging, publishing, tagging, deploying to a real Vault, or changing
versions, persistence protocols or the interop protocol. Source and functional checks are independent of
hosted CI color. Do not change unrelated workflows, gates or dependencies to chase CI status, or interpret
ignoring CI as permission to omit directly relevant regressions, source preservation or host checks.
