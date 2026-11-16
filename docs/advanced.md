# Advanced numbering, captions and references

[Back to the Number Suite README](../README.md)

## Roman numeral limits and batch recovery

Roman numeral templates support values from 1 to 3999. Preview checks every generated heading, including later increments and parent counters referenced by a template. If any Roman counter is outside that range, Write and Renumber leave the entire file unchanged and explain how to adjust the start or format. Cleanup remains available. Display-only numbering omits an unavailable label instead of showing a decimal fallback.

A failed batch or Undo can also fail while restoring earlier writes. The result reports how many files were restored, failed to restore, or have an unconfirmed outcome, and identifies the files to inspect. Existing recovery data is retained where storage permits; a separate message reports an unconfirmed recovery save. Keep copies and review affected files before retrying Undo last batch. Concurrent edits are preserved, so a partial recovery must not be treated as a successful full restore.

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
target already has a unique block ID, Number Suite reuses its authored spelling and copies immediately,
including a standalone ID after one blank line. Multiple IDs on one target or an ID owned by more than
one target block the action. Otherwise it previews
one bounded Markdown change and creates an ID only after confirmation. Caption IDs are appended to
the caption line; heading IDs use the valid following block-ID line. It then copies a reference with
a readable alias. This explicit command is the only caption/reference workflow that creates an ID.
Ordinary `[[#...]]` links, cross-file links, and missing or ambiguous targets remain unchanged
by default. The optional **Enhance ordinary same-note Wiki heading links** setting
is off by default; when enabled, Live Preview shows an effective number on
unique `[[#Heading]]` heading links (aliases are retained) without writing to
the source. Cross-file links, links that include a file path, captions,
block links, embeds, and unresolved or ambiguous targets remain native links.
Reading View continues to use Obsidian's native rendering for ordinary Wiki links.

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

## Native Obsidian Outline enhancements (work in progress)

The **Outline enhancements** settings page defaults the three independent controls on:
number labels, H7–H9 extended headings, and Figure/Table/Equation/Code caption navigation.
They do not modify Markdown or change the source numbering rules. The compatibility
layer augments only the native Outline view, without writing synthetic metadata headings
into Obsidian's vault-wide cache; when the expected private native view API is missing,
it retains the unmodified Outline. Synthetic entries are navigation-only: do not drag
them to rewrite content. Host drag/selection and Android acceptance are still pending.
The existing Number Suite Document outline is retained until parity and cleanup are verified.

The native Outline header uses the public Obsidian ItemView action for **Open heading mind map**,
and Current note offers the same action next to the file name. Both resolve the file shown
by their own pane; the command-palette action continues to work independently. The old
Document outline and its tab remain available until native-host acceptance is complete.

## Heading mind-map structure editing (experimental)

The heading map remains a non-writing browser **until** the user explicitly
selects **Adjust structure** in its toolbar. In that mode, dragging a heading
card onto another heading card may reorder complete sections **only if both
headings are siblings under the same parent and have the same level**.
The upper/lower insertion indicator (or left/right for top-to-bottom layout)
shows the destination; dropping elsewhere is a no-op. No cross-parent moves,
level changes, synthetic nodes or arbitrary canvas positions are supported.

Each accepted edit moves the original source range, including prose, nested
headings and captions, by one bounded Obsidian editor transaction so the
editor's native Undo can reverse it. Source content must still match the
snapshot at drag start, and the note must be open in a matching Markdown editor.
The tool refuses a conflicting/stale snapshot or a file-only session rather
than rewriting the file without the editor's undo history. It does not
rewrite stored heading numbers or retarget other files' links; run Renumber
separately if needed.

This is a Draft implementation awaiting real desktop/Android Obsidian acceptance.
The desktop HTML drag gesture is not yet equivalent to an accessible
keyboard move control or reliable mobile long-press reorder.
