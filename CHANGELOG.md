# Changelog

All notable changes to Number Suite are documented here.

## Unreleased

### Added

- Added the explicit Number Suite/DocWen H7-H9 source extension across parsing, nine-level
  counters and templates, Properties starts, transformations, Live Preview, Reading View, and
  stable-ID reference export.
- Added the strict read-only `number-suite.interop.v2` consumer contract with H1-H9 display
  segments and exactly nine counter values.
- Added a persistent right sidebar with Document outline and Current note tabs. The outline nests
  H1-H9 headings and fixed captions, supports collapse and source-line navigation, and shares the
  effective Number Suite display plan.

### Changed

- Existing six-template custom schemes migrate with H7-H9 empty so upgrading does not introduce
  new numbering into old notes.
- The ribbon icon now opens the sidebar; current-note Markdown actions keep their separate preview
  and stale-source checks.

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
