---
acceptance-keep: reference-navigation-baseline
number-suite:
  - heading.virtual=true
---

# Reference acceptance

## Unique target

Target body sentinel. ^reference-target

Figure: Reference figure

![[square-edge.svg]]

## Links

Explicit title: @[[#Unique target]]

Explicit alias: @[[#Unique target|explicit alias]]

Explicit caption: @[[#Figure: Reference figure]]

Explicit block: @[[#^reference-target|block alias]]

Ordinary local: [[#Unique target]]

Ordinary alias: [[#Unique target|native alias]]

File-qualified local: [[Reference navigation#Unique target]]

File-qualified alias: [[Reference navigation.md#Unique target|qualified alias]]

Cross-file control: [[Number Suite#First|cross-file alias]]

Block control: [[#^reference-target|native block alias]]

Embed control: ![[#Unique target]]

Markdown control: [markdown alias](<#Unique target>)

Missing control: [[#Missing target]]

## Duplicate target

First ambiguous heading.

## Duplicate target

Second ambiguous heading.

Ambiguous control: [[#Duplicate target]]

End of reference controls. Keep the caret here when observing inactive decorations.
