# Advanced numbering, captions and references

[Back to the Number Suite README](../README.md)

## Extended H7-H9 headings

Number Suite and DocWen share an explicit extension for Word heading levels 7 through 9. Write
exactly 7, 8, or 9 leading `#` characters, followed by whitespace. Ten or more hashes remain
ordinary text. The extension participates in numbering, starts, resets, exclusions, writes,
Live Preview, Reading View, and the read-only `number-suite.interop.v2` consumer snapshot.

H7-H9 are not native Obsidian/CommonMark heading levels, so Obsidian's built-in Outline, Backlinks,
heading-path navigation, and other native heading indexes may not recognize them. Number Suite's
own sidebar outline does include them and its navigation uses source lines. Use an authored stable
block ID such as `######## Deep topic ^deep-topic` for reliable interoperation and references. Put
each extended heading in its own paragraph, with a blank line around it, when Reading View
enhancement is required. The Markdown source remains canonical and unchanged by display-only use.

## Captions and objects

Caption and cross-reference display never writes Markdown. A caption is a top-level paragraph that
starts with exactly `Figure:`, `Table:`, `Equation:`, or `Code:`. `Listing:` is not an alias. A
recognized caption is displayed as one filled pill; its optional number is part of that pill. Normal
`[[#...]]` links remain entirely Obsidian's.
The caption keyword controls its semantic label and counter, while the adjacent standalone block is
its visual carrier. Any caption type may bind an image, Markdown table, display equation, or fenced
code block, so a `Figure:` caption can label a table that lays out a composite figure. Keep the caption beside its object, with at most one blank line between them. Leave two blank lines to separate them. A caption with candidates on both
sides, or an object with multiple candidate captions, stays unbound. An unbound caption remains a
numbered, referenceable caption pill but has no object placement or object hover behavior.
Caption alignment is independent from caption numbering. Figure and Equation captions are centered
by default; the four fixed caption types can each be changed independently in the Captions tab.
Each type also has an independent visual **Above the object** or **Below the object** setting; all
four default to above. Every bound caption is anchored to the carrier block with the same compact,
theme-independent gap; changing position never rewrites the file. When the cursor enters a caption
in Live Preview, its pill disappears and the exact authored `Figure: ... ^id`-style source returns
at its stored location. Source Mode always shows the authored Markdown. An individual
cross-reference likewise reveals only its own `@[[...]]` source while it is being edited. Touch and
IME editing follow the same local rule: only the active heading, caption, or reference reveals its
source, while unrelated virtual numbers and pills remain visible.

In editing mode, right-click a standalone `![[image.png]]` or `![alt](image.png)` image to add its
Figure caption; right-click any row of a top-level Markdown table for Table, a standalone `$$...$$`
display equation for Equation, or a top-level fenced code block for Code. The action follows the
actual right-click target, so an image does not need to be selected first. The same Table action is
contributed to the rendered context menu when Structural Tables owns a table in Live Preview,
including ordinary-table takeover and multi-row structural headers. Number Suite checks the file, original text, and exact table position before offering the action. If an older Structural Tables version does not provide that information, or the table syntax is unsupported, the menu explains that the action is unavailable. Add or edit the caption in Source mode in that case. Either plugin also works independently.

The dialog previews the exact Markdown line before one bounded editor transaction. All newly
created captions are stored above their objects. A legacy Figure caption found immediately below
its image offers a bounded move-above action. If the adjacent keyword differs only in case, such as
`figure:`, the same action corrects it instead of adding a duplicate. An existing adjacent caption
of any type suppresses a second caption action. Existing exact captions, note
embeds, inline images, inline math, inline code, and images/math/code inside table cells do not offer
an independent caption action. Cross-references may still be written inside table cells. Creating a
caption never creates a block ID. Moving or normalizing an existing caption preserves its inline and following block IDs, so existing block references keep pointing to that caption.

**Show image and Figure-caption hover details** is on by default. Hovering either member of a bound
Figure pair shows the rendered caption and non-size wiki replacement text or Markdown alt text.
Equal caption and replacement text is shown once; filename-only and `500`/`500x300` size values are
suppressed. An inline or table-cell image may show replacement text only, but remains ineligible for
its own Figure caption.

## Same-file cross references

Open **Settings → Number Suite → Cross references** and enable **Show same-file cross references**.
Prefix a same-file target link with `@`. A unique heading can be referenced by heading name, and a
unique caption can be referenced by its complete typed name. A number is included when the target
has one, but heading and caption numbering can both be off.

```markdown
## Installation

See @[[#Installation]] or @[[#Installation|installation section]].

Figure: Architecture ^fig-architecture

See @[[#Figure: Architecture]] or @[[#^fig-architecture|architecture diagram]].
```

If the heading displays as `1` and the caption displays as `Figure 1: Architecture`, the reference
pills display as `1 Installation`, `1 installation section`, `Figure 1: Architecture`, and
`Figure 1: architecture diagram`. With numbering off, the same references remain pills but omit the
number. Heading virtual numbers use compact filled pills; caption targets use filled pills; references
use an interactive outline treatment so targets and links remain distinguishable.

For a readable manual reference, use `@[[#Heading]]` or a complete caption name such as
`@[[#Figure: Architecture]]`. Heading and caption names share one same-file lookup space; zero or
multiple exact targets fail closed. Untyped names resolve only as headings. Number Suite never
auto-rewrites an existing title reference if a later edit introduces ambiguity.

For a stable reference, right-click a heading or caption and choose **Copy cross-reference**. If the
target already has a block ID, Number Suite reuses it and copies immediately. Otherwise it previews
one bounded Markdown change and creates an ID only after confirmation. Caption IDs are appended to
the caption line; heading IDs use the valid following block-ID line. It then copies a reference with
a readable alias. This explicit command is the only caption/reference workflow that creates an ID.
Ordinary `[[#...]]` links, cross-file links, and missing or ambiguous targets remain unchanged.

## Footnotes and endnotes

Typed note display also leaves Markdown unchanged. `[^id]` and `[^footnote:id]` are footnotes and
display as `1`, `2`, `3`; `[^endnote:id]` is an endnote and displays as `E1`, `E2`, `E3`. Both
counters start at 1 per file and follow first-reference order. A repeated reference reuses its first
number.

The Footnotes & endnotes settings tab can keep original markers visible in Live Preview or replace
them with formatted numbers. With formatted numbers enabled, click a displayed number or move the
cursor to it to reveal and edit the stored marker. Reading View keeps numbered native navigation.
Missing, duplicate, conflicting, or render-mismatched definitions remain native Obsidian content.
Two-space multiline note bodies are protected from heading, caption, and semantic-reference
scanning.
