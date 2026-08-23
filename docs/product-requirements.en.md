---
doc_id: product-requirements
language: en
source_language: zh-CN
translation_of: product-requirements.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-08-23
---

# Product requirements

[中文规范源](product-requirements.zh-CN.md)

<!-- section: authority -->
## Document authority

The Chinese document is the normative source for Structured Numbering product requirements. This file
is its synchronized English translation. If implementation, tests, or other documents conflict
with it, update and review the Chinese source first, then synchronize English. Historical acceptance
records prove only their candidate and host environment; they cannot change product requirements.

<!-- section: purpose -->
## Product purpose

Structured Numbering lets users control separately whether heading numbers are stored in Markdown and
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

The product handles top-level ATX H1-H6 headings and supports Live Preview, Reading View,
current-note writes, batch operations, built-in and custom schemes, exact-title exclusions,
per-note Properties, display-only caption numbers, footnote/endnote numbers, same-file semantic
cross references, and English/Chinese UI. One Markdown file is the scope for heading schemes, each
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
    without a block ID, and display must never write a stored caption number. Each fixed type has an
    independent centering toggle that also works when caption numbering is off; Figure and Equation
    default on, while Table and Code default off and follow the theme.
10. Only `@[[#Heading]]` and `@[[#^block-id]]`, with optional Obsidian aliases, request semantic
    same-file enhancement. Ordinary links remain unchanged. Resolution consumes existing anchors
    and fails closed unless the unique target has a visible valid heading or caption number.
11. The plugin must not create, validate, migrate, repair, or otherwise manage heading or block IDs.
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

- No section-local scheme switching or user-defined control syntax beyond the frozen caption,
  footnote/endnote, and explicit semantic-reference declarations.
- No automatic rewriting of heading links, embeds, or external anchors.
- No cross-file semantic-reference resolution.
- No commitment to Setext, Canvas, Outline, Backlinks, Search Results, or PDF export integration.
- No claim that automated tests, emulator records, or a successful build accept every host platform.

<!-- section: acceptance -->
## Product acceptance

Every requirement needs pure-logic or adapter coverage. Claims involving real Obsidian UI, IME,
mobile, themes, or lifecycle also need dated evidence from an isolated vault. Source checks,
candidate-package checks, host acceptance, physical-device acceptance, and public release status
must be reported separately. See the [testing strategy](testing-strategy.en.md) and
[release policy](release.en.md).
