---
doc_id: architecture
language: en
source_language: zh-CN
translation_of: architecture.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-08-29
---

# Number Suite — Architecture

[中文规范源](architecture.zh-CN.md)

<!-- section: authority -->
## Document authority

The Chinese document is the normative architecture source; this file is its synchronized English
translation.

<!-- section: system-shape -->
## System shape

```text
Markdown source
  -> context-aware ATX and frozen-semantic scanners
  -> template compiler + shared prefix analysis
  -> heading/caption numbering + per-kind note numbering + fail-closed reference resolution
  -> immutable transform plan OR non-writing display decoration plan
  -> Editor/Vault adapter OR Live Preview/Reading View adapter
```

The numbering core and plan layers remain pure. Obsidian, CodeMirror, DOM, Editor, and Vault exist
only in adapters. Virtual display and file operations cannot implement separate numbering rules.

<!-- section: core -->
## Core and configuration boundaries

`heading-parser.ts` returns native ATX H1-H6 plus exact H7-H9 extension headings and source offsets
while skipping frontmatter, fenced code, HTML/Obsidian comments, and blocks. Ten or more hashes are
not headings. `template-compiler.ts` compiles placeholders into an AST used for
rendering, validation, and template-prefix recognition. `number-parser.ts` supplies provenance,
style, rule, and confidence for plugin, template, and manual prefixes; `prefix-analysis.ts` is the
shared display/write entry point.

`numbering-engine.ts` owns H1-H9 counters, starts, resets, empty-template structural semantics,
exclusions, and skipped-level strategy. `scheme-template-validation.ts` enforces template semantics
before a custom scheme can be saved.

`document-semantics.ts` is the pure scanner for the four fixed caption declarations and explicit
same-file `@` references. It skips protected Markdown regions, creates no IDs, treats duplicate
targets as ambiguous, and restarts all four independent caption counters for each source document.
`semantic-display-plan.ts` combines those results with the heading display plan. Heading and complete
typed caption names share one candidate set, so exactly one target must remain. Reference labels use
the alias or target title and include a heading/caption number only when it is visible.

`note-semantics.ts` parses default/explicit footnotes and endnotes, numbers each kind separately in
first-reference order, and reuses numbers for repeated references.
It marks definition continuations indented by two spaces or a tab as protected containers so that
heading, caption, and semantic-reference scanners cannot consume note content. Missing, duplicate,
or canonically conflicting definitions do not enter the display plan.

`document-outline.ts` is a pure projection over the authenticated H1-H9 parser, caption scanner,
and heading display plan. It nests headings by source level, attaches captions to the deepest
preceding heading, removes only the final authored block-ID token from display labels, and emits
source lines for navigation. It neither reads the Vault nor writes Markdown.

<!-- section: interop-api -->
## Consumer interoperability API

The plugin exposes a read-only `number-suite.interop.v2` API. Given source Markdown and
sanitized note overrides, it returns a JSON-serializable consumer-neutral snapshot: UTF-16 source
ranges, heading and caption targets, resolved same-file references, and the effective enabled
display segments and counters. It exposes no Obsidian, CodeMirror, DOM, or private Number Suite
classes and performs no file write. The snapshot shares the parsers and numbering engine used by
the display plan, so consumers do not re-infer numbers. If a stored prefix must be concealed but a
consumer cannot express removal of that stored prefix, the affected heading is not presented as
losslessly materializable; the consumer must fail closed or use its own safe fallback.

A fully ignored note returns `disabled: true` with empty heading, caption, and reference arrays.
Every exported target range covers its complete physical source line in UTF-16, excluding the line
ending. `authoredText` excludes a trailing block-ID token and may therefore be empty for a legal
ID-only caption such as `Equation: ^energy`. `targetId` reports exactly one unambiguous authored ID,
whether inline or on the supported following standalone line; duplicate or multiple candidate IDs
fail closed to `null`, and references through a duplicated ID are omitted. Display literals retain Number Suite's
general template boundary, including percent characters and literals longer than 32 characters.
A narrower consumer format must validate that boundary in its own adapter. Caption visual
placement, alignment, pills, and tooltips never change these source facts.

<!-- section: display-adapters -->
## Display adapters

`NumberSuiteSidebarView` is one persistent right-side `ItemView` with two internal tabs. The outline
tab reads the active editor when uniquely available and otherwise uses a cached Vault read, then
renders the pure outline projection. The current-note tab owns a reusable controls pane instead of
a modal. Workspace file, leaf, editor, and Vault-modify events refresh only the relevant active tab;
the selected tab is stored as view state. Navigation resolves an existing Markdown leaf when
possible and otherwise opens the file at the projected source line.

Each CodeMirror `EditorView` owns one `ViewPlugin` that confirms scanner candidates against the
syntax tree, distinguishes Live Preview from Source Mode, and uses `Decoration.widget` and
`Decoration.replace` for virtual display and concealment. Concealment is removed when selection
touches a heading. During IME composition, only the selected heading loses its decoration; unrelated
decorations remain visible. Each view caches its effective Properties. Invalid YAML may retain the
last valid display configuration, but file operations fail closed.

For extension levels 7-9, the syntax-tree adapter trusts only candidates authenticated by the same
protected-region scanner because CommonMark has no native H7-H9 node. Live Preview adds a line
style and conceals the marker outside active editing or composition; Source Mode keeps it visible.

The Reading View postprocessor reads the full source and creates one document numbering plan before
mapping `MarkdownSectionInformation` ranges. DOM changes occur only when source and rendered heading
counts and levels match exactly; concealment also validates exact leading text. Heading content is
never passed to `innerHTML`. An H7-H9 line must map to a standalone paragraph whose visible prefix
still contains the exact extension marker; otherwise the section fails closed.

Caption and reference widgets use the same CodeMirror lifecycle and full-source Reading View cache,
but never enter `TransformPlan` or a display-triggered Editor/Vault mutation path. `caption-objects.ts`
authenticates standalone images, Markdown tables, display equations, and fenced code blocks. Caption
type and carrier type are independent. A candidate graph accepts zero or one intervening blank line
and emits only one-to-one bindings; two blank lines and either-side ambiguity fail closed. Owned
object ranges may include following block IDs, while separate visual ranges stop at the rendered
carrier boundary. Image replacement text remains separate from filename suggestions.
Caption replacements render the whole authored line as one widget; a selection touching the line
removes that replacement so exact source is editable. A direct CodeMirror `StateField`, rather than
a view-plugin decoration callback, supplies every bound caption as a block widget above or below the
carrier visual range. Widget-internal padding owns the compact gap; source and object ranges remain
unchanged. Composition state never suppresses the whole semantic layer: selection filtering reveals
only the active caption or reference, and inactive pills remain. Unbound captions remain line widgets. Reference
decorations replace the complete visual source with a focusable pill and exact source-line target.
Reading View preserves the native Obsidian link element while storing its original text, ARIA, and
removed `@`; cleanup restores all of them. Embedded Markdown is keyed by `context.sourcePath`, so counters and targets never leak
between the embedding file and embedded source. Caption alignment and visual placement remain
independent from whether a virtual caption number is present. Reading View locates carriers by their
actual object kind and records stable comment anchors for display-only movement and cleanup. Image and caption tooltip metadata feeds one document-level
structured tooltip controller and is removed during cleanup.

Footnotes and endnotes also enter only the display decoration plan. CodeMirror replaces visible
reference and definition labels, but drops a replacement whenever the selection touches its source
range so the stored marker becomes editable. Note widgets return pointer events to CodeMirror.
Reading View preserves Obsidian's native footnote links and list structure and stays unchanged unless
source-plan and rendered-node counts match exactly. Cleanup restores original visible text, ARIA
labels, and list values on reprocessing, view changes, and plugin disable.

<!-- section: file-mutations -->
## File mutations

Current-note work creates an immutable `TransformPlan`, then revalidates file, the uniquely matching
editor view, and source at confirmation before applying one editor transaction. This remains true
when the action starts from a focused sidebar. Batch work saves open editors, plans every
file, shows an aggregate preview, revalidates all sources, persists a bounded recovery snapshot,
then performs exact-content conditional replacements. Failure rolls back only files that still
contain plugin output. Concurrent edits are preserved and recovery remains available.

Caption context actions use a separate pure `CaptionInsertionPlan`. The scanner accepts only
standalone image syntax, a validated top-level Markdown table, a display equation, or a fenced code
block at the actual context-menu position (with cursor fallback), excludes inline/table-cell and
protected containers, and suppresses adjacent captions of every semantic type. A case-only adjacent keyword becomes
a bounded normalization plan; a legacy Figure below its image becomes a bounded relocation plan.
The modal collects and previews one
single-line title; confirmation revalidates the file path, entire editor source, and original target
before applying exactly one editor change.

`StructuralTableCaptionMenuBridge` observes only Structural Tables' public rendered host class and
`data-structural-source-table-index` marker. It contributes the same action to `Menu.forEvent`, maps
that index through Number Suite's independent Markdown table scanner, preserves multi-row headers,
and fails closed if the host, Markdown view, index, or source table cannot be resolved. Number Suite
does not import Structural Tables code and remains independently installable.

Stable-reference context actions use a separate pure `StableReferencePlan`. Target recognition is
limited to the heading or fixed caption at the actual context-menu position. Existing inline or immediately
following IDs produce no write. Otherwise the plan generates a collision-safe ID at the valid target
position (inline on captions, following line for headings), exact
before/after preview, and readable aliased `@[[#^id|title]]` link. Confirmation revalidates the file,
full source, target, and generated ID before one editor transaction; clipboard output follows the
explicit user action.

<!-- section: persistence -->
## Persistence

`data.json` stores schema-versioned settings only. A serialized save coordinator coalesces frequent
updates and exposes pending, failure, and retry state. The latest batch snapshot is stored separately
in `recovery.json`; settings reset cannot delete it. Templates retired by custom-scheme edits or
deletion enter cleanup history until explicitly cleared.

<!-- section: release-boundary -->
## Build and release boundary

The build externalizes Obsidian and CodeMirror host modules and emits only `dist/main.js`,
`dist/manifest.json`, and `dist/styles.css`. Source gates, candidate contracts, and version contracts
do not replace isolated-vault host acceptance. See the [release policy](release.en.md).

<!-- section: change-rules -->
## Change rules

- `src/core` cannot import Obsidian, browser globals, or Node runtime modules.
- File writes consume only immutable plans that passed preview and stale-content validation.
- Broader cleanup recognition requires false-positive tests first.
- New settings need sanitization, cloning, persistence, and a UI contract.
- Interoperability schema changes require a version bump and host-neutral plain-data results.
- Changes to Chinese architecture, product, or UX sources synchronize English and pass docs checks.
