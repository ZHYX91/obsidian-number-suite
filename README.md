# Number Suite

[English](https://github.com/ZHYX91/obsidian-number-suite/blob/main/README.md) · [简体中文](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.zh-CN.md) · [繁體中文](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.zh-TW.md) · [日本語](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.ja.md) · [한국어](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.ko.md) · [Deutsch](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.de.md) · [Français](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.fr.md) · [Español](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.es.md) · [Português (Brasil)](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.pt-BR.md) · [Русский](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.ru.md) · [Tiếng Việt](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.vi.md) · [العربية](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/i18n/README.ar.md)

Want numbered headings without changing your notes? Turn on **Show virtual numbers**. Number Suite can also display numbers for captions, references, footnotes, and endnotes. To put heading numbers into Markdown, run **Write numbers** or **Renumber** separately, review the preview, and confirm. You can also hide numbers already written in a note without deleting them. Everything runs locally.

<!-- section: screenshots -->
## Screenshots

### See numbering without changing a note

See virtual heading numbers, caption numbers, same-file references, footnotes, and endnotes together
without changing the stored Markdown.

![Number Suite display-only heading, caption, reference, footnote, and endnote numbers](https://raw.githubusercontent.com/ZHYX91/obsidian-number-suite/main/docs/assets/number-suite-document-numbers-en.png)

### Check settings for this note

Use the Current note tab in the Number Suite sidebar to compare global defaults, per-note
overrides, and effective values before changing the note.

![Number Suite current-note effective settings and per-note overrides](https://raw.githubusercontent.com/ZHYX91/obsidian-number-suite/main/docs/assets/number-suite-current-note-controls-en.png)

### Review changes before writing to Markdown

Review every proposed before-and-after change and any warning before Number Suite writes to
Markdown.

![Number Suite preview of heading number writes](https://raw.githubusercontent.com/ZHYX91/obsidian-number-suite/main/docs/assets/number-suite-write-preview-en.png)

<!-- section: features -->
## Features

- Show calculated heading numbers in Live Preview and Reading View without changing Markdown.
- Conceal recognized stored numbers while keeping the source unchanged and accessible.
- Combine virtual display and concealment to replace one recognized stored prefix visually.
- Preview and then write, remove, or renumber headings in the current note.
- Number headings in a folder or vault after reviewing a preview. If files change after preview, the operation stops; completed batches can be undone.
- Use built-in hierarchical, Chinese official-document, and legal-document schemes.
- Create multiple custom schemes with validated H1-H9 templates and retained cleanup history.
- Use exact seven-, eight-, or nine-hash source lines as DocWen-compatible H7-H9 extensions.
- Open a Number Suite document outline for H1-H9 headings and Figure, Table, Equation, and Code
  captions; select an item to navigate to its source line.
- Explore the current document in a read-only 2D heading mind map. Each heading is a card whose
  left handle shows its effective number when available and whose right handle shows and toggles
  the number of direct child headings.
- Exclude an exact heading or its whole subtree without consuming a number.
- Show `Figure:`, `Table:`, `Equation:`, and `Code:` captions as filled pills, with optional
  display-only numbers that restart independently in every Markdown file.
- Center each caption type independently; Figure and Equation captions are centered by default,
  while Table and Code captions follow the current theme.
- Place each bound caption above or below its object in Live Preview and Reading View without
  rewriting Markdown; newly created captions are stored above their object.
- Show a structured hover card on an image or its Figure caption, with the rendered caption as the
  title and meaningful image replacement text as the content.
- Show explicit `@[[...]]` links to headings, captions, and block IDs in the same note as clickable reference labels, with numbers when available.
- Copy a stable cross-reference from a heading or caption context menu, reusing an existing block ID
  or previewing one new ID before it is created.
- Show footnotes as `1`, `2`, `3` and endnotes as `E1`, `E2`, `E3` for `[^id]`,
  `[^footnote:id]`, and `[^endnote:id]`; repeated references reuse the first number.
- Override display, concealment, scheme, starting counters, skipped-heading counts, or full opt-out per note.

<!-- section: requirements-and-compatibility -->
## Requirements and compatibility

- Obsidian `1.12.7` or later.
- Desktop and Android Obsidian. Android 15 / API 35 is the baseline mobile acceptance profile.
- iOS behavior is not currently verified.

<!-- section: installation -->
## Installation

### Community Plugins

Open **Settings → Community plugins → Browse**, search for **Number Suite**, install it, and enable
it. If it is not available in your catalog, use the manual installation below.

### Manual installation

Download the versioned ZIP from [GitHub Releases](https://github.com/ZHYX91/obsidian-number-suite/releases), extract it, and place the `number-suite` folder inside `.obsidian/plugins/`. You can also place `main.js`, `manifest.json`, and `styles.css` from the same release in `.obsidian/plugins/number-suite/`. Reload Obsidian and enable the plugin. Do not mix files from different versions.

<!-- section: usage -->
## Usage

**Not sure where to start?** To see heading numbers without changing your note, enable **Show virtual numbers** under **Heading numbering**. To save numbers into Markdown for other tools, use **Write numbers** from the sidebar's **Current note** tab and review the preview before applying.

| Source state | Desired result | Action | Changes Markdown |
|---|---|---|---|
| No stored number | Show a number only in Obsidian | Enable virtual numbers | No |
| No stored number | Save calculated numbers | Write heading numbers | Yes |
| Stored number | Hide it visually | Enable concealment | No |
| Stored number | Replace it with a calculated display number | Enable virtual numbers and concealment | No |
| Stored number | Remove it from the file | Remove heading numbers | Yes |

Concealment has one global recognition rule: either only numbers carrying Number Suite source
markers, or numbers matching known built-in/current/retired scheme templates. A note can override
hide/show/inherit, but cannot silently broaden that recognition rule.

The ribbon icon opens a persistent right sidebar. Its **Document outline** tab shows Number Suite
H1-H9 headings and captions; its **Current note** tab contains note-level display, scheme, and file
actions. **Open current note controls** selects that tab directly. File-changing commands still
open a separate preview before applying anything. Writing or removing a number changes the heading
text and can invalidate `[[Note#Heading]]` links, heading embeds, or external anchors; the plugin
does not guess and rewrite those links.

Use **Open heading mind map** from the command palette or the map button in Document outline to open
the current Markdown note as an ordered heading tree. A file card connects all top-level headings
and remains visible even when the note has none. It shows the file name, a file icon and the number
of top-level headings; it never replaces a same-name H1. The initial overview shows the first two levels of the heading tree at a readable size. Click the file name above the map to return from a subtree, or the
zoom percentage to restore 100%. The left heading-card handle shows the virtual number that is
actually displayed, or a reliably recognized visible stored number; otherwise it falls back to the
heading level. The right handle always shows the count of direct child headings and toggles only that
branch. Select a card and switch between the whole document and that heading's subtree, show 1, 2,
3, or all structural depths, and switch between left-to-right and top-to-bottom layout. Search shows
the current match count; Enter and Shift+Enter move forward and backward through matches without
changing structural counts. Drag empty space or scroll to pan, hold Ctrl/Cmd while scrolling to zoom
around the pointer, use two-finger pinch zoom on touch devices, and use +, -, 0 or the toolbar
controls for zoom/Fit. Double-click a heading card or press Enter on its body to jump to its exact
source line. The map is display-only: it does not reorder headings, edit Markdown, or count captions
as child headings.

### Extended H7–H9 headings

Exact runs of seven, eight, or nine opening `#` characters extend the levels that Number Suite can number and navigate. These levels are not native Obsidian headings; use stable block IDs for links that must also work outside the plugin.

### Captions and objects

Write a standalone `Figure:`, `Table:`, `Equation:`, or `Code:` caption beside its object. Displaying its number or moving a bound caption visually does not rewrite the note; explicitly creating or relocating a caption does. Ambiguous object bindings remain unbound rather than guessed.

### Same-file cross references

Use `@[[#Heading]]` or `@[[#Figure: Architecture]]` for a display-only reference within the current note. **Copy cross-reference** can reuse a stable block ID or offer one carefully previewed write before creating it. Ordinary `[[#...]]` links are left to Obsidian.

### Footnotes and endnotes

`[^id]` / `[^footnote:id]` and `[^endnote:id]` have separate display counters. Display-only numbering does not rewrite their definitions.

For exact syntax, object-placement ambiguity, IDs and editor behavior, read the [advanced numbering, captions and references guide](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/advanced.en.md).

<!-- section: settings -->
## Settings

Open **Settings → Number Suite → General** for the **User guide** and **Report an issue** links.

Settings use one accessible seven-tab surface on every supported Obsidian version: General,
Heading numbering, Captions, Cross references, Footnotes & endnotes, Write and cleanup, and Display
and batch. The tab itself identifies the current section, so its content starts directly with the
first control or guide. Headings are reserved for genuine subgroups such as caption placement and alignment,
appearance, and batch operations.

**Exporting to Word:** Number Suite uses optional Markdown extensions for captions, references, H7–H9 headings, and typed endnotes. [DocWen Assistant](https://github.com/ZHYX91/obsidian-docwen-assistant) can export through a separately installed local DocWen application on Windows/Linux desktop. Enable the needed **input** extensions in DocWen's Markdown syntax settings; Word-export numbering follows DocWen's selected conversion options, not necessarily the numbers visible in Obsidian.

### Numbering schemes

The selected scheme controls both virtual display and any later file operation, but **selecting a scheme does not write to the note**. The display updates immediately only where virtual numbering is enabled. Writing or renumbering still requires a separate command, preview, and confirmation.

Alongside the existing hierarchical, Chinese-official and legal schemes, there are optional Traditional Chinese, Japanese, Korean and Arabic-Indic chapter/section styles. These are **examples of writing conventions, not national standards for every document**. The plugin may suggest a scheme based on interface language, but never silently selects it, and changing interface language never changes your scheme. You can choose any scheme regardless of interface language.

In the template editor, `arabic` still means the familiar Western digits `1, 2, 3`; use `arabic_indic` for `١، ٢، ٣`. Traditional Chinese has separate `chinese_traditional_lower` and `chinese_traditional_upper` formats. All styles can be previewed before use.

Templates use `{heading-level.number-format}` placeholders, such as `{1.arabic}` or
`{2.chinese_lower}`. Supported formats are Arabic, full-width Arabic, lower/upper Chinese, circled,
upper/lower Latin letters, and upper/lower Roman numerals.

An empty Hn template does not output a number, but that heading remains structural: it increments
its counter, resets deeper counters, and can be referenced by descendant templates. A non-empty Hn
template must include an Hn placeholder and must not reference a deeper heading level. Each heading level uses its own template. Templates must be single-line, must not
start with whitespace, and must not contain HTML comments or U+2060 source markers. A bare letter or
Roman-numeral counter is rejected unless the template adds an explicit delimiter, such as
`{1.letter_lower}.`.

Custom schemes may exclude exact logical heading titles. A whole-subtree exclusion skips the
heading and all descendants; a heading-only exclusion leaves descendants to the selected
skipped-level strategy. Exclusions do not use fuzzy matching or regular expressions.

### Cleanup and source markers

The cleanup preview starts from the saved default scope and lets you choose source markers, known
templates, or the broader common-manual-number scope for that operation. Ambiguous decimals,
versions, years, dates, and measurement-like prefixes are preserved by default.

Optional U+2060 source markers make plugin-written numbers exact to identify. They are experimental
and disabled by default because invisible characters can affect interoperability, copied text, and
heading links. A dedicated command removes markers while retaining visible numbers.

### Per-note Properties

The sidebar's Current note tab exposes global, override, and effective values. Untouched notes receive no
plugin Properties. Returning a control to **Follow global** deletes that property; **Restore all**
removes every Number Suite override and preserves unrelated Properties.

```yaml
---
number-suite:
  - heading.virtual=true
  - heading.hide-stored=true
  - heading.scheme=hierarchical-h2
  - heading.first-number.h2=3
  - heading.skip-first.h2=2
---
```

`heading.first-number.h2=3` means the first participating H2 displays 3. It does not skip headings.
`heading.skip-first.h2=2` skips the first two non-empty H2 headings without consuming their counter.
Use `number-suite: [disabled=true]` to opt the note out of display and file operations. Cleanup
scope is deliberately not note metadata; choose it in each cleanup or renumber preview.

Legacy Number Suite Properties remain readable. An explicit change in Current note migrates that
note to the canonical list and removes only the old Number Suite fields. Equivalent old/new values
are accepted; conflicts, duplicate directives, unknown directives, invalid values, and unavailable
schemes fail closed.

Current-note number fields save after a short typing pause, on Enter, or when leaving the field.
Failed input remains available for Retry, and outline navigation stays in the originating pane.

<!-- section: limitations -->
## Limitations

- One Markdown file has one effective numbering scheme; section-local scheme switching is not
  supported.
- Caption counters and semantic-reference resolution are also scoped to one Markdown file. Embedded
  files use their own source and counters; cross-file semantic references are not recognized.
- When using DocWen, caption labels and the object they describe remain distinct: for example,
  a `Figure:` caption can describe a table while the table remains a table in Word. The resulting
  document depends on the selected conversion options and should be reviewed before sharing.
- Footnote and endnote counters are independent and file-scoped. Obsidian still owns note anchors,
  navigation, layout, and definition rendering; the plugin changes only validated visible labels.
- Top-level ATX H1-H6 plus Number Suite/DocWen H7-H9 extension headings are handled. Setext
  headings, blockquotes, lists, comments, frontmatter, fenced code, and HTML blocks are not
  numbering targets. Native Obsidian heading indexes remain limited to their own supported syntax.
- Headings and captions inside lists or blockquotes do not enter document numbering. Ordinary
  footnote and cross-reference links in their text still work; fenced code examples stay unchanged.
- Canvas, Obsidian's built-in Outline, Backlinks, Search Results, and PDF export integration are not
  supported. Number Suite provides its own H1-H9-and-caption sidebar outline.
- Source Mode decorations are disabled by default so stored Markdown remains directly visible.
- Reading View concealment changes visible text, not the heading DOM `id`; anchors still follow the
  stored heading.
- If a third-party renderer changes heading count or levels, Reading View fails closed for that
  section.

<!-- section: privacy-and-security -->
## Privacy and security

Number Suite runs locally and contains no networking, telemetry, analytics, advertisements,
remote fonts, or remote assets. Virtual display and concealment never call file-write APIs.

Opening a batch tool enumerates the Vault's folder tree and Markdown file list so Number Suite can
filter the chosen scope, exclude configured folders, and produce an exact preview before writing.

Current-note changes use one editor transaction. Batch operations preview all targets, revalidate
their exact content, persist bounded recovery data, and avoid overwriting concurrent edits. These
safeguards stop the plugin from applying an outdated preview. Keep your usual backups when making changes across many notes.

Report security or data-loss concerns through [GitHub Security Advisories](https://github.com/ZHYX91/obsidian-number-suite/blob/main/SECURITY.md) without
including private vault content.

<!-- section: development -->
## Development

Use Node.js `24.19.0` and npm `11.17.0`.

```bash
npm ci
npm run check
```

Project documents:

- [Product requirements](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/product-requirements.en.md)
- [UX specification](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/ux-spec.en.md)
- [Architecture](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/architecture.en.md)
- [Testing strategy](https://github.com/ZHYX91/obsidian-number-suite/blob/main/docs/testing-strategy.en.md)

Project links:

- [Contributing guide](https://github.com/ZHYX91/obsidian-number-suite/blob/main/CONTRIBUTING.md)
- [Security policy](https://github.com/ZHYX91/obsidian-number-suite/blob/main/SECURITY.md)
- [Changelog](https://github.com/ZHYX91/obsidian-number-suite/blob/main/CHANGELOG.md)

<!-- section: support -->
## Support

- [Q&A](https://github.com/ZHYX91/obsidian-number-suite/discussions/categories/q-a): Usage and configuration questions.
- [Ideas](https://github.com/ZHYX91/obsidian-number-suite/discussions/categories/ideas): Early feature and workflow ideas.
- [Show and tell](https://github.com/ZHYX91/obsidian-number-suite/discussions/categories/show-and-tell): Tips, workflows, and reference implementations.

Use [GitHub Issues](https://github.com/ZHYX91/obsidian-number-suite/issues/new/choose) for reproducible bugs
and feature requests. Include plugin and Obsidian versions, operating system, minimal synthetic
Markdown, the selected scheme, and the exact action taken. Do not attach private vault content.

<!-- section: license -->
## License

[MIT](https://github.com/ZHYX91/obsidian-number-suite/blob/main/LICENSE)
