---
doc_id: architecture
language: en
source_language: zh-CN
translation_of: architecture.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-08-23
---

# Architecture

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

`heading-parser.ts` returns ATX headings and source offsets while skipping frontmatter, fenced code,
HTML/Obsidian comments, and blocks. `template-compiler.ts` compiles placeholders into an AST used for
rendering, validation, and template-prefix recognition. `number-parser.ts` supplies provenance,
style, rule, and confidence for plugin, template, and manual prefixes; `prefix-analysis.ts` is the
shared display/write entry point.

`numbering-engine.ts` owns H1-H6 counters, starts, resets, empty-template structural semantics,
exclusions, and skipped-level strategy. `scheme-template-validation.ts` enforces template semantics
before a custom scheme can be saved.

`document-semantics.ts` is the pure scanner for the four fixed caption declarations and explicit
same-file `@` references. It skips protected Markdown regions, creates no IDs, treats duplicate
targets as ambiguous, and restarts all four independent caption counters for each source document.
`semantic-display-plan.ts` combines those results with the heading display plan. A heading reference
receives a label only from a number that will actually remain visible; a caption reference receives
its fixed type label only when caption display is enabled.

`note-semantics.ts` parses default/explicit footnotes and endnotes, numbers each kind separately in
first-reference order, and reuses numbers for repeated references.
It marks definition continuations indented by two spaces or a tab as protected containers so that
heading, caption, and semantic-reference scanners cannot consume note content. Missing, duplicate,
or canonically conflicting definitions do not enter the display plan.

<!-- section: display-adapters -->
## Display adapters

Each CodeMirror `EditorView` owns one `ViewPlugin` that confirms scanner candidates against the
syntax tree, distinguishes Live Preview from Source Mode, and uses `Decoration.widget` and
`Decoration.replace` for virtual display and concealment. Concealment is removed when selection
touches a heading or during IME composition. Each view caches its effective Properties. Invalid YAML
may retain the last valid display configuration, but file operations fail closed.

The Reading View postprocessor reads the full source and creates one document numbering plan before
mapping `MarkdownSectionInformation` ranges. DOM changes occur only when source and rendered heading
counts and levels match exactly; concealment also validates exact leading text. Heading content is
never passed to `innerHTML`.

Caption and reference widgets use the same CodeMirror lifecycle and full-source Reading View cache,
but never enter `TransformPlan` or any Editor/Vault mutation path. Reading View preserves the native
Obsidian link element and replaces only the explicit leading `@` while enhanced. Cleanup restores
that marker. Embedded Markdown is keyed by `context.sourcePath`, so counters and targets never leak
between the embedding file and embedded source.

Footnotes and endnotes also enter only the display decoration plan. CodeMirror replaces visible
reference and definition labels; Reading View preserves Obsidian's native footnote links and list
structure and stays unchanged unless source-plan and rendered-node counts match exactly. Cleanup
restores original visible text and list values on reprocessing, view changes, and plugin disable.

<!-- section: file-mutations -->
## File mutations

Current-note work creates an immutable `TransformPlan`, then revalidates file, view, and source at
confirmation before applying one editor transaction. Batch work saves open editors, plans every
file, shows an aggregate preview, revalidates all sources, persists a bounded recovery snapshot,
then performs exact-content conditional replacements. Failure rolls back only files that still
contain plugin output. Concurrent edits are preserved and recovery remains available.

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
- Changes to Chinese architecture, product, or UX sources synchronize English and pass docs checks.
