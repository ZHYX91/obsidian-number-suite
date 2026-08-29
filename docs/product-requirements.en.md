---
doc_id: product-requirements
language: en
source_language: zh-CN
translation_of: product-requirements.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-08-29
---

# Number Suite — Product requirements

[中文规范源](product-requirements.zh-CN.md)

<!-- section: authority -->
## Document authority

The Chinese document is the normative source for Number Suite product requirements. This file
is its synchronized English translation. If implementation, tests, or other documents conflict
with it, update and review the Chinese source first, then synchronize English. Execution evidence
cannot change product requirements.

<!-- section: purpose -->
## Product purpose

Number Suite lets users control separately whether heading numbers are stored in Markdown and
whether they are visible in Obsidian. Users must be able to keep clean source, save stored numbers,
conceal stored numbers, or replace their visual presentation with calculated numbers while every
file change remains previewable, explainable, and recoverable where practical.

<!-- section: users-and-jobs -->
## Users and core jobs

- Users who want hierarchical numbers in Obsidian without changing Markdown.
- Users who need numbered Markdown for other tools.
- Users with stored numbers who want to conceal or safely remove them.
- Users who need official-document, legal-document, or custom hierarchical formats.
- Users who need consistent operations for one note, a folder, or a vault.

<!-- section: scope -->
## Scope

The product handles top-level native ATX H1-H6 headings plus the exact Number Suite/DocWen H7-H9
extension and supports Live Preview, Reading View, current-note writes, batch operations, built-in and custom schemes, exact-title exclusions,
per-note Properties, display-only caption numbers, footnote/endnote numbers, same-file semantic
cross references, a Number Suite H1-H9-and-caption sidebar outline, and English/Chinese UI. One Markdown file is the scope for heading schemes, each
caption-type counter, footnote/endnote counters, and reference resolution; embedded files remain
governed by their own source and settings.

<!-- section: functional-requirements -->
## Functional requirements

1. Virtual display and visual concealment must not modify Markdown.
2. Write, remove, renumber, and marker-removal operations must first create immutable preview plans.
3. Virtual display, Reading View, and file operations must share one numbering semantics.
4. An empty Hn template outputs nothing but still increments, resets descendants, and participates
   in descendant templates.
5. A non-empty Hn template must contain its own-level placeholder and cannot reference descendants.
6. Templates retired by custom-scheme edits or deletion must remain available for recognizing old
   plugin numbers until the user explicitly clears history.
7. Exact exclusions cannot use fuzzy or regular-expression matching and cannot consume counters.
8. Untouched notes must receive no plugin Properties; returning to inheritance must delete the
   relevant property.
9. Only top-level `Figure:`, `Table:`, `Equation:`, and `Code:` paragraphs declare captions;
    `Listing:` is not compatible. Each type counts independently from 1 per Markdown file, with or
    without a block ID, and display must never write a stored caption number. A recognized caption
    uses one filled pill whether numbering is on or off. Each fixed type has an
    independent centering toggle that also works when caption numbering is off; Figure and Equation
    default on, while Table and Code default off and follow the theme. The caption type controls
    semantic labeling and numbering, not carrier type: any caption may bind one adjacent standalone
    image, table, display equation, or fenced code block. Zero or one blank line may separate them;
    two blank lines break the binding; caption/object candidate ambiguity fails closed. Unbound
    declarations remain captions. Each type independently displays above or below its bound object,
    defaulting above, without rewriting source; the carrier anchor owns one compact visual gap.
    Image/Figure hover details are enabled by default and separate the rendered caption from
    meaningful replacement text while suppressing duplicates, sizes, and filename-only noise.
10. Only explicit `@[[#target]]` and `@[[#^block-id]]` forms, with optional Obsidian aliases, request
    same-file enhancement. A target may be one unique heading name or one unique complete typed
    caption name such as `Figure: Architecture`. Heading and caption names share one ambiguity
    space; zero or multiple matches fail closed. A number is included when visible but is not required.
11. Display and caption insertion must never create or rewrite IDs. The explicit **Copy
    cross-reference** context action may reuse an existing target block ID or, after exact preview
    and stale-source validation, create one block ID at the target's valid Markdown position in one
    editor transaction. Caption IDs are inline; heading IDs may use a following standalone line. Existing
    title references are never migrated or auto-rewritten when later edits introduce ambiguity.
12. `[^id]` and `[^footnote:id]` declare footnotes, while `[^endnote:id]` declares endnotes.
    Footnotes and endnotes each count independently from 1 per Markdown file in first-reference
    order, and repeated references reuse the first number. Footnotes display plain numbers and
    endnotes display an `E` prefix.
13. Footnote/endnote display must not create, rename, or rewrite definitions, references, IDs, or
    other Markdown. Missing definitions, duplicate definitions, canonical ID conflicts between
    default and explicit footnotes, and source/render count mismatches fail closed. Definition
    continuations indented by two spaces or a tab are protected containers and cannot be scanned as
    headings, captions, or semantic references. Live Preview can show formatted numbers or original
    markers; clicking or moving the cursor to a formatted number reveals the editable marker, while
    Reading View preserves native navigation.
14. H7-H9 are recognized only on top-level lines with exactly 7, 8, or 9 leading hashes followed
    by whitespace; 10 or more hashes remain ordinary text. The extension uses the same nine-level
    parser, counter, template, Properties-start, transformation, and `number-suite.interop.v2`
    semantics. Existing six-template custom schemes migrate with H7-H9 empty. Native Obsidian
    Outline, Backlinks, heading-path navigation, and other host heading indexes are not claimed;
    stable authored block IDs are the recommended interoperation target.
15. The ribbon opens a persistent right sidebar with Document outline and Current note tabs. The
    outline follows the active Markdown file, nests H1-H9 and fixed captions, uses effective
    Number Suite display labels, supports collapse and source-line navigation, and never modifies
    Markdown. Markdown-changing actions from Current note still require the normal preview and
    stale-source checks.
16. The editor context menu offers caption insertion only on standalone image embeds, top-level
    Markdown tables, standalone display equations, and top-level fenced code blocks. Figure, Table,
    Equation, and Code captions are stored above their objects; an adjacent legacy Figure caption
    below its image offers a bounded migration. The actual context-menu target takes precedence over
    the editor cursor. Inline and table-cell images, math, and code never become independent caption
    targets. A Structural Tables-owned Live Preview widget contributes the same Table action through
    its rendered menu and maps its public source-table index back to the complete Markdown range;
    an uncertain mapping fails closed. An adjacent case-only keyword mismatch is normalized instead of duplicated. Every action
    requires a title preview, an immutable bounded plan, exact source revalidation, and one editor
    transaction; unsupported, protected, stale, ambiguous, or already captioned targets fail closed.
    An adjacent caption of any semantic type makes the carrier already captioned.
17. Heading virtual numbers use compact filled pills, whole captions use wrapping filled pills, and
    enhanced references use keyboard-focusable interactive outline pills. Target and reference
    treatments differ by fill and border rather than color alone.

<!-- section: safety-requirements -->
## Safety requirements

- Ambiguous decimals, versions, years, dates, and measurement-like prefixes fail closed by default.
- Writes cannot silently replace unconfirmed manual numbering.
- Current-note confirmation must revalidate the file, view, and previewed source.
- Batch work must revalidate every target, persist bounded recovery data, and stop on concurrent
  conflicts instead of overwriting them.
- Source markers remain off by default and have a removal path that keeps visible numbers.
- The plugin contains no networking, telemetry, advertisements, or remote assets.
- Stored-heading edits can break heading links; the plugin warns instead of guessing link rewrites.

<!-- section: non-goals -->
## Non-goals

- No section-local scheme switching or user-defined control syntax beyond the frozen H7-H9,
  caption, footnote/endnote, and explicit semantic-reference declarations.
- No automatic rewriting of heading links, embeds, or external anchors.
- No cross-file semantic-reference resolution.
- No commitment to Setext, Canvas, Obsidian's built-in Outline, Backlinks, Search Results, or PDF
  export integration. The plugin-owned sidebar outline is in scope.
- No claim that automated tests, emulator records, or a successful build accept every host platform.

<!-- section: acceptance -->
## Product acceptance

Every requirement needs pure-logic or adapter coverage. Claims involving real Obsidian UI, IME,
mobile, themes, or lifecycle also need evidence from an isolated Vault using the exact candidate.
Source checks, candidate-package checks, host acceptance, physical-device acceptance, and public
release status must be evaluated separately. See the [testing strategy](testing-strategy.en.md) and
[release policy](release.en.md).
