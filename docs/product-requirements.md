---
doc_id: product-requirements
language: en
source_language: zh-CN
translation_of: product-requirements.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-11-17
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
conceal stored numbers, or replace their visual presentation with calculated numbers while heading transformations remain previewable, explainable, and recoverable where practical. Explicit note settings save Properties separately and expose save status.

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
cross references, enhanced native Obsidian H1-H9-and-caption Outline, and the 12 supported interface languages. One Markdown file is the scope for heading schemes, each
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
8. Untouched notes must receive no plugin Properties. Note overrides use one `number-suite` text
   list with canonical `path=value` directives for disabled state, virtual display, stored-number
   hiding, scheme, H1-H9 first displayed numbers, and H1-H9 skipped-heading counts. Returning to
   inheritance removes the directive. Legacy fields remain read-compatible; equivalent dual values
   are accepted, while conflicts, duplicates, unknown directives, invalid values, and unavailable
   schemes fail closed. An explicit Current note edit may migrate that note without touching
   unrelated Properties; cleanup scope is an operation-preview choice, not note metadata.
9. First displayed number and skipped-heading count are independent per-level semantics. Skip-first
   counts non-empty headings in whole-file source order at each level, including headings excluded
   by the scheme; skipped headings do not consume counters and do not implicitly skip descendants.
10. Only top-level `Figure:`, `Table:`, `Equation:`, and `Code:` paragraphs declare captions;
    `Listing:` is not compatible. Each type counts independently from 1 per Markdown file, with or
    without a block ID, and display must never write a stored caption number. A recognized caption
    uses one filled pill whether numbering is on or off. Each fixed type has an
    independent centering toggle that also works when caption numbering is off; Figure and Equation
    default on, while Table and Code default off and follow the theme. The caption type controls
    semantic labeling and numbering, not carrier type: any caption may bind one adjacent standalone
    image, table, display equation, or fenced code block. Zero or one blank line may separate them;
    two blank lines break the binding; caption/object candidate ambiguity fails closed. Unbound
    declarations remain captions. Native table body text remains table content even without pipes;
    caption-looking text immediately below table rows needs a blank line to become a caption.
    Each type independently displays above or below its bound object,
    defaulting above, without rewriting source; the carrier anchor owns one compact visual gap.
    Image/Figure hover details are enabled by default and separate the rendered caption from
    meaningful replacement text while suppressing duplicates, sizes, and filename-only noise.
11. Only explicit `@[[#target]]` and `@[[#^block-id]]` forms, with optional Obsidian aliases, request
    same-file enhancement. A target may be one unique heading name or one unique complete typed
    caption name such as `Figure: Architecture`. Heading and caption names share one ambiguity
    space; zero or multiple matches fail closed. A number is included when visible but is not required. Ordinary same-file Wiki heading enhancement is independently off by default; when enabled it supports Live Preview, Reading View and file-qualified same-file targets while preserving aliases and native interaction. Cross-file, block, embed and ordinary Markdown links are excluded. Explicit references navigate on one click and expose F2 and a mobile-accessible source-edit action.
12. Display and caption insertion must never create or rewrite IDs. The explicit **Copy
    cross-reference** context action may reuse an existing target block ID or, after exact preview
    and stale-source validation, create one block ID at the target's valid Markdown position in one
    editor transaction. Caption IDs are inline; heading IDs may use a following standalone line. Existing
    standalone IDs may follow one blank line and retain their authored case when reused. Multiple IDs on
    one target or multiple owners of one ID must not trigger a new ID or an arbitrary choice. Existing
    title references are never migrated or auto-rewritten when later edits introduce ambiguity.
13. `[^id]` and `[^footnote:id]` declare footnotes, while `[^endnote:id]` declares endnotes.
    Footnotes and endnotes each count independently from 1 per Markdown file in first-reference
    order, and repeated references reuse the first number. Footnotes display plain numbers and
    endnotes display an `E` prefix.
    Note and semantic-reference markers in ordinary text follow Markdown backslash parity:
    odd runs escape the marker; even runs leave it active. Protected code, HTML, and link
    destinations remain excluded independently of this rule.
14. Footnote/endnote display must not create, rename, or rewrite definitions, references, IDs, or
    other Markdown. Missing definitions, duplicate definitions, canonical ID conflicts between
    default and explicit footnotes, and source/render count mismatches fail closed. Definition
    continuations indented by two spaces or a tab are protected containers and cannot be scanned as
    headings, captions, or semantic references. Live Preview can show formatted numbers or original
    markers; clicking or moving the cursor to a formatted number reveals the editable marker, while
    Reading View preserves native navigation.
15. H7-H9 are recognized only on top-level lines with exactly 7, 8, or 9 leading hashes followed
    by whitespace; 10 or more hashes remain ordinary text. The extension uses the same nine-level
    parser, counter, template, Properties-start, transformation, and `number-suite.interop.v2`
    semantics. Existing six-template custom schemes migrate with H7-H9 empty. Native Outline is enhanced by the plugin; Backlinks, heading-path navigation, and other host heading indexes are not claimed;
    stable authored block IDs are the recommended interoperation target.
16. The ribbon directly opens Current note in the persistent sidebar, without Document outline or internal tabs. Legacy commands, shortcuts and workspace state remain compatible through migration. General provides a default-on Enhance native Outline switch. Turning it off removes enhancements and the map entry while retaining preferences, without enabling core Outline. Its toolbar Display options menu has four shared persistent choices: heading numbers, heading levels when unnumbered, H7–H9, and captions. These affect Outline only; existing saved off values remain off. Each heading shows a filled calculated-number pill and, when a reliably recognized source number remains visible, a separate outlined source-number pill; either may appear alone. With no visible number and level display enabled, show a neutral H1–H9 pill. Hover identifies its level. Caption leaves keep their type icon, localized ordinal and secondary title, without pills or expand arrows. Native navigation and effective body numbering remain unchanged. Never enable the core Outline plugin automatically; provide guidance when it is disabled. Preserve native collapse, filtering, current-location following, multiple panes and pinned files without changing Markdown or the shared metadata cache. Headings use a small number pill followed by text. Captions use a type icon, localized type and ordinal, and secondary text; the whole row is not a pill. Captions are non-expandable leaves ordered by source position within their section. Counts match effective body numbering, remain independent of filtering and collapse, and are not stored again. H7-H9 support same-parent, same-level dragging of complete sections including prose, captions and descendant headings, with explicit insertion targets, stale-source rejection and complete Undo/Redo. Do not change parent or level, independently drag captions, or globally disable native H1-H6 dragging. The mind map opens from native Outline, Current note and commands; pane actions bind their own source file. Explicit structure editing reuses bounded immutable plans and guarded writes for same-parent, same-level whole-section dragging and up/down buttons.

17. The editor context menu offers caption insertion only on standalone image embeds, top-level
    Markdown tables, standalone display equations, and top-level fenced code blocks. Figure, Table,
    Equation, and Code captions are stored above their objects; an adjacent legacy Figure caption
    below its image offers a bounded migration. The actual context-menu target takes precedence over
    the editor cursor. Inline and table-cell images, math, and code never become independent caption
    targets. A Structural Tables-owned Live Preview widget contributes the same Table action through
    its rendered menu and authenticates the versioned file path, exact source text, and UTF-16 range;
    a table ordinal is never a write target and uncertain mappings fail closed. An adjacent case-only keyword mismatch is normalized instead of duplicated. Every action
    requires a title preview, an immutable bounded plan, exact source revalidation, and one editor
    transaction; unsupported, protected, stale, ambiguous, or already captioned targets fail closed.
    An adjacent caption of any semantic type makes the carrier already captioned.
18. Heading virtual numbers use compact filled pills, whole captions use wrapping filled pills, and
    enhanced references use keyboard-focusable interactive outline pills. Target and reference
    treatments differ by fill and border rather than color alone.

Inline code, inline math, block-equation interiors and valid Markdown link destinations and titles declare no captions, semantic references or notes, including supported spans across physical lines. Protection follows exact source ranges and preserves prose outside those spans on the same line and markers in visible link text. Invalid or unclosed link-like text is not masked merely because it contains parentheses. Escaped, unmatched and whitespace-delimited dollar text remains ordinary prose. Legal GFM data rows belong to their table even when delimiter cells contain only one or two hyphens, boundary pipes are omitted or the first cell begins with a caption keyword; they must not be moved or converted into captions. This protection does not expand the supported caption-menu carriers. An equation carrier remains independent of its protected interior.

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

- Unload stops new batch and Undo forward writes. A dispatched host write must settle; exact compensation may continue without overwriting later edits. A newly enabled instance waits before taking ownership of recovery data.

<!-- section: non-goals -->
## Non-goals

- No section-local scheme switching or user-defined control syntax beyond the frozen H7-H9,
  caption, footnote/endnote, and explicit semantic-reference declarations.
- No automatic rewriting of heading links, embeds, or external anchors.
- No cross-file semantic-reference resolution.
- No commitment to Setext, Canvas, Backlinks, Search Results, or PDF export integration. Native Obsidian Outline enhancement is in scope.
- No claim that automated tests, emulator records, or a successful build accept every host platform.

<!-- section: acceptance -->
## Product acceptance

Every requirement needs pure-logic or adapter coverage. Claims involving real Obsidian UI, IME,
mobile, themes, or lifecycle also need evidence from an isolated Vault using the exact candidate.
Source checks, candidate-package checks, desktop/Android-emulator acceptance, and public release
status must be evaluated separately. Android physical devices and iOS are out of scope. See the [testing strategy](testing-strategy.md). Publication uses the repository-owned
workflow and requires explicit authorization.


### Source numbers and native Wiki headings — presentation rules

The global **Outline stored heading numbers** setting defaults on beside **Hide stored numbers**. When concealment is off, it wraps only a reliably identified authored heading-number core in a thin outlined pill; suspicious years, versions, low-confidence prefixes and arbitrary prose numbers remain plain source text. Source Mode and Markdown remain unchanged. Virtual numbering uses a filled accent-tinted pill and is not written to the document; where both types are visible they remain separate, even when the text matches. The native Outline and heading map follow the same filled/outlined distinction, whereas the neutral H level remains a level marker. This does not change caption styles.

The separate **ordinary same-note Wiki link enhancement** remains off by default. With it on, only a target that actually displays a virtual number gains a neutral grey, inert prefix badge; a stored number or H level never substitutes. An explicit `|alias` remains exactly authored and never has its digits deduplicated or rewritten. Without an alias, **Hide stored numbers** removes a reliably recognized source prefix from the visible label only, leaving `href`, link selection, modifier-click, context menu and the original `[[...]]` unchanged. No alias + no virtual number means no badge, although concealment may still apply. Live Preview and Reading View use the same rule for `[[#Heading]]` and links that Obsidian resolves to the current note; other-file, block and embed links stay native. If the source prefix cannot be authenticated, do not conceal or mark it. The explicit `@[[...]]` reference continues as one whole reference pill.

The four visible combinations for a reliably numbered heading with source prefix `一、` and a calculated number `1` are: virtual OFF / conceal OFF → `一、标题`; OFF / ON → `标题`; ON / OFF → neutral `1` prefix + `一、标题`; ON / ON → neutral `1` prefix + `标题`. This is only display: toggles never rewrite links or heading text.
