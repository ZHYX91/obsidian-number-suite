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
