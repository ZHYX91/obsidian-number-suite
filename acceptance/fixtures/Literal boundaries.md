# Literal ownership

The code below has one backtick at each end and spans three physical lines.

`example
@[[#Actual]] [^code-only]
end`

$$
Figure: literal
$$
Figure: actual equation caption

## Actual

Inline math $[^math-only] @[[#Actual]]$ must not contribute a note or reference.

The first prose footnote is [^actual]. The valid reference is @[[#Actual]].

[^code-only]: A code example must not consume a number.
[^math-only]: A math example must not consume a number.
[^actual]: The first prose footnote must be 1.

## Omitted boundary pipes

| Name | Value |
| --- | --- |
Figure: Alpha | Beta
| Gamma | Delta |

## Genuine adjacent caption

$$ a=b $$
Code: adjacent equation caption

## Short GFM delimiter

| Name | Value |
| - | - |
Table: Alpha | Beta

Table: Actual standalone caption

## Existing reference target

^Original-ID

The existing reference is @[[#^Original-ID|Existing reference target]].

## Native code-span pipes and structural code cells

The first block is a native three-column table: its body must not number as a caption.

`A | B` | C
--- | --- | ---
Table: Native body, not a caption

The next block is not a native table: the two-column delimiter does not match the header. Its caption must remain visible.

`A | B` | C
--- | ---
Table: Real caption after mismatched native columns

The following Structural Tables extension retains two cells in the header.

`A | B` | C
--- || ---
D | E

Table: Real caption after structural table
