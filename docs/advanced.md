# Advanced numbering, captions and references

[Back to the Number Suite README](../README.md)

## Show shorter numbers on headings

Under **Display & appearance → Virtual heading number format**, choose **Current level only** for headings in the note to show `5` where the scheme gives `1.2.3.4.5`. The Outline and heading map follow the note by default. Links and references to headings keep the scheme’s label by default, so readers can identify the full path even when two headings both display `5`. You can change each choice independently. A scheme that already formats only one level, such as `第３章`, keeps its own wording and punctuation.

These choices apply to virtual heading numbers. Stored numbers keep their original spelling, and writing, renumbering and semantic export use the note’s numbering scheme.

## Roman numeral limits and batch recovery

Roman numeral templates support values from 1 to 3999. Preview checks every generated heading, including later increments and parent counters referenced by a template. If any Roman counter is outside that range, Write and Renumber leave the entire file unchanged and explain how to adjust the start or format. Cleanup remains available. Display-only numbering omits an unavailable label instead of showing a decimal fallback.

A failed batch or Undo can also fail while restoring earlier writes. The result reports how many files were restored, failed to restore, or have an unconfirmed outcome, and identifies the files to inspect. Existing recovery data is retained where storage permits; a separate message reports an unconfirmed recovery save. Keep copies and review affected files before retrying Undo last batch. Concurrent edits are preserved, so a partial recovery must not be treated as a successful full restore.

## Extended H7-H9 headings

Number Suite and DocWen share an explicit extension for Word heading levels 7 through 9. Write
exactly 7, 8, or 9 leading `#` characters, followed by whitespace. Ten or more hashes remain
ordinary text. The extension participates in numbering, starts, resets, exclusions, writes,
Live Preview, Reading View, and the read-only `number-suite.interop.v2` consumer snapshot.

H7-H9 are not native Obsidian/CommonMark levels. Number Suite enhances native Outline; other host heading indexes may not recognize them. Use an authored stable
block ID such as `######## Deep topic ^deep-topic` for reliable interoperation and references. Put
each extended heading in its own paragraph, with a blank line around it, when Reading View
enhancement is required. The Markdown source remains canonical and unchanged by display-only use.

## Captions and objects

Caption and cross-reference display never writes Markdown. A caption is a top-level paragraph that
starts with exactly `Figure:`, `Table:`, `Equation:`, or `Code:`. `Listing:` is not an alias. A
recognized caption is displayed as one filled pill; its optional number is part of that pill. Normal
`[[#...]]` links remain entirely Obsidian's.
In **Captions → Caption numbering scope**, choose **Whole note** or **Restart in each section**. The latter reveals a heading-level choice, initially H1. With H2 selected, the first figure in section 1.2 is **Figure 1.2-1**, including when referenced from section 1.3. Tables, equations and code count separately. Shortening the heading in the note or Outline does not shorten its caption prefix.

A section ends at the next heading of the selected level or a higher level. The prefix comes from the section heading’s full numbering scheme, including per-note starts. A heading that advances its counter but has an empty template uses its numeric counter. Empty, excluded, skipped and unnumberable section headings end the preceding section. Captions outside a numbered section share one unprefixed counter per type across the note. Embedded notes use their own source. The existing interoperability v2 export keeps its document-wide caption ordinals.

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
cross-reference likewise reveals only its own `@[[...]]` source while it is being edited.
Click a rendered cross-reference to jump directly; when that link has keyboard focus,
press **F2** to place the text cursor inside its Markdown source. Moving the
text cursor into a reference by ordinary keyboard navigation also exposes its
source. Modifier-assisted selection remains an editing action rather than
a forced jump. Touch and
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
is off by default; when enabled, Live Preview and Reading View show an effective number on
unique `[[#Heading]]` and file-qualified same-note `[[Note#Heading]]` links (aliases are retained) without writing to
the source. The number is a separate, non-interactive visual prefix: Obsidian
still renders and navigates the actual Wiki link, including its context menu,
normal selection, and modified-click behavior. Cross-file links, caption targets, block links, embeds, and unresolved or ambiguous targets retain Obsidian's unmodified native display.
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

## Native Outline and structure editing

Enable Obsidian's core Outline plugin first; Number Suite never enables it automatically and provides guidance when unavailable. The ribbon opens Current note directly. Open headings in Obsidian’s Outline. Current note has two tabs, Display & numbering and Edit note text. Existing shortcuts and saved workspaces continue to open the corresponding view.

General provides a default-on Enhance native Outline switch. Turning it off removes enhancements and the map entry while retaining preferences, without enabling core Outline. Its toolbar Display options menu has four shared persistent choices: heading numbers, heading levels when unnumbered, H7–H9, and captions. These affect Outline only; existing saved off values remain off. A heading can show a filled calculated number and a separate solid- or dashed-outline source number if both are visible. Either pill can appear on its own. With no visible number and level display enabled, show a neutral H1–H9 pill. Hover identifies its level. Caption leaves keep their type icon, localized ordinal and secondary title, without pills or expand arrows. Native navigation and effective body numbering remain unchanged.

H7–H9 dragging moves a complete section, including prose, captions and descendant headings, only among same-parent, same-level siblings. An insertion marker identifies the destination. Changed source is rejected; one bounded editor transaction supports native Undo/Redo. Captions cannot move independently, and H1–H6 native operations stay available.

The native Outline toolbar and Current note header open the heading map for their own source file, retaining that binding across focus changes. The command follows the active note. The map browses without writing until Adjust structure is explicitly enabled. That mode supports same-parent, same-level whole-section dragging and Move section up/down buttons. Invalid destinations do nothing. A matching Markdown editor and unchanged snapshot are required. Reordering never changes heading levels, rewrites numbers or retargets links.


### Source numbers and native Wiki headings — presentation rules

In **Heading numbering**, disable a built-in scheme to exclude its templates from automatic outlining and concealment immediately. Re-enable it to recognize those templates again. The selected scheme controls numbering; any enabled scheme can recognize existing numbers. Another scheme, a plugin marker, or the independent handwritten scopes can still match the same prefix. Existing per-note scheme choices retain their numbering format and show the disabled status in Current note. Explicit, previewed cleanup can still recognize historical formats.

In **Heading numbering**, **Stored heading number outline scope** follows **Stored-number recognition**. Its choices are **Off**, **Only scheme matches or plugin-marked numbers** (default), and **Include common handwritten numbers**. Visible numbers that match a scheme or carry a Number Suite marker use a solid, transparent outline. The broadest option also adds a dashed outline to recognized manual-only prefixes with medium or higher confidence. Suspicious years, versions, measurements, and low-confidence prefixes stay as plain text. Concealment keeps its own scope, so a handwritten prefix can stay visible and outlined while scheme-matching prefixes are hidden. Virtual numbers use filled accent pills and can appear alongside a stored number, even if the values match. Live Preview, Reading View, native Outline, and the heading map share these rules and identify pill types on hover and for assistive technology. Source Mode has no stored-number outlines. Markdown, cleanup scope, and caption styling are unaffected.

When virtual numbering is enabled, a heading with a calculated number shows it even if its original
prefix is still visible. To hide common handwritten prefixes such as `1) ` on an H2 heading,
enable **Hide stored numbers** and choose **Also hide common handwritten numbers** under
**Stored-number recognition**.

For one note, choose **Current note → Display & numbering → Stored numbers → Hide** to reveal **Hide scope**. **Follow global** uses the global recognition scope even when global hiding is off. The other choices apply only to this note and save `heading.hide-stored-scope=plugin`, `heading.hide-stored-scope=templates`, or `heading.hide-stored-scope=common` in its `number-suite` list. Existing notes without this directive follow the global scope. Selecting **Show** or inheriting global visibility keeps the saved scope inactive until you select **Hide** again. The scope is independent of outlining and file cleanup.

The separate **ordinary same-note Wiki link enhancement** remains off by default. With it on, only a target that actually displays a virtual number gains a neutral grey, inert prefix badge; a stored number or H level never substitutes. An explicit `|alias` remains exactly authored and never has its digits deduplicated or rewritten. Without an alias, **Hide stored numbers** removes a reliably recognized source prefix from the visible label only, leaving `href`, link selection, modifier-click, context menu and the original `[[...]]` unchanged. No alias + no virtual number means no badge, although concealment may still apply. Live Preview and Reading View use the same rule for `[[#Heading]]` and links that Obsidian resolves to the current note; other-file, block and embed links stay native. If the source prefix cannot be authenticated, do not conceal or mark it. The explicit `@[[...]]` reference continues as one whole reference pill.

The Chinese official scheme writes its first four levels as `一、总体要求`, `（一）指导思想`, `1.工作目标`, and `（1）具体措施`. Existing headings with spaces still match. For example, with the scheme enabled, both `# 一、标题` and `## 一、 标题` can show an outlined `一、`. Display prefers the heading’s own level when templates match the same prefix. A match at another level leaves the Markdown level intact and cannot by itself authorize removing or renumbering text.

In a custom template, trailing spaces specify the exact separator to write. During recognition, a template ending in a space requires at least one horizontal space or tab, including a full-width space. A custom template consisting of `{1.chinese_lower}、` followed by a space recognizes `一、 标题` and leaves `一、二、三` alone. Another enabled scheme or the optional handwritten rules can still recognize that prefix. Bare numeric formats keep a separator. A compact dot before a digit also needs one to avoid forming a decimal: for the title `2项措施`, the official scheme writes `1. 2项措施`.

With the official scheme enabled and a virtual number of `1`, showing both numbers displays a filled `1` and the original `一、标题`. Hiding stored numbers leaves the filled `1` and `标题`. Turning off virtual numbers leaves just the visible source text in each case. An unaliased native Wiki link follows the target’s concealment while keeping its original destination.
