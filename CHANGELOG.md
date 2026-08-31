# Changelog

All notable changes to Number Suite are documented here.

## Unreleased

## 0.3.1 - 2026-08-31

### Fixed

- Protected settings that use a newer data schema from being overwritten, and kept serialized save
  failures visible with an explicit retry path.

## 0.3.0 - 2026-08-30

### Added

- Added the explicit Number Suite/DocWen H7-H9 source extension across parsing, nine-level
  counters and templates, Properties starts, transformations, Live Preview, Reading View, and
  stable-ID reference export.
- Added the strict read-only `number-suite.interop.v2` consumer contract with H1-H9 display
  segments and exactly nine counter values.
- Added a persistent right sidebar with Document outline and Current note tabs. The outline nests
  H1-H9 headings and fixed captions, supports collapse and source-line navigation, and shares the
  effective Number Suite display plan.
- Added previewed editor context actions for placing Figure, Table, Equation, and Code captions
  above standalone objects, using the actual right-click target, including case-only keyword repair,
  legacy below-image Figure migration, and stale-source checks.
- Added fail-closed Table-caption menu interoperability for Structural Tables-owned Live Preview
  widgets, including ordinary-table takeover and consecutive structural header rows.
- Added one **Copy cross-reference** context action for headings and captions. It reuses an existing
  block ID or previews one bounded valid-position ID insertion before copying a readable stable link.
- Added per-type display-only caption placement and a default-on structured image/Figure hover card
  with replacement-text deduplication and size/filename suppression.

### Changed

- Existing six-template custom schemes migrate with H7-H9 empty so upgrading does not introduce
  new numbering into old notes.
- The ribbon icon now opens the sidebar; current-note Markdown actions keep their separate preview
  and stale-source checks.
- Heading virtual numbers, whole captions, and explicit same-file references now use a related pill
  system with filled target treatments and interactive outlined reference treatments.
- Same-file references no longer require a visible target number. Unique full caption names such as
  `@[[#Figure: Architecture]]` resolve without a block ID; ambiguous heading/caption names fail closed.
- Caption and cross-reference settings now include visual source-to-result examples and explain
  manual readable links, stable right-click links, ambiguity, ID creation boundaries, visual
  placement, and image hover behavior.
- Figure, Table, Equation, and Code caption semantics can bind to any supported standalone carrier
  above or below them across zero or one blank line. Local ambiguity stays unbound instead of being
  guessed from a wider document-wide matching.
- Attached captions remain visible and aligned with their carrier in Live Preview and Reading View,
  including safe zero-gap image paragraphs that Obsidian renders as one shared block.
- Touch and IME editing reveal source only for the active heading, caption, or reference while
  unrelated virtual numbers and pills remain visible.

## 0.2.0 - 2026-08-28

### Added

- Support Number Suite on Android Obsidian, including coarse-pointer and narrow-screen settings,
  mobile Live Preview heading syntax, and IME-safe display decorations.

### Changed

- Keep current-candidate Android execution evidence outside the public plugin repository while the
  public release gate verifies the portable mobile-support contract.

## 0.1.0 - 2026-08-25

### Added

- Display-only or stored numbering for Markdown headings.
- Independent numbering for captions, footnotes, endnotes, and same-file references.
- Per-type caption centering, with Figure and Equation centered by default.
- Distinct footnote and endnote labels, editable Live Preview numbers, and an original-marker mode.
- Built-in and custom numbering schemes with exact-title exclusions.
- Per-note Property overrides with in-app guidance, previewed file changes, stale-content checks, and guarded batch recovery.
- Strict heading, number, and template validation with deterministic handling of malformed or unsafe input.
- Native-style settings navigation with clear active states and task-focused usage guides.
- English and Simplified Chinese interfaces.

This is the first release of the independent `number-suite` plugin. It does not migrate
settings, Properties, or data from other plugin identifiers.
