---
description: |
  ---
  # Hidden heading
  Figure: Hidden caption
  @[[#Real heading]]
  [^hidden]: Hidden note
other: >
  ...
  # Also hidden
---
# Real heading
<custom-tag>
## Hidden HTML heading
</custom-tag>

Text <!-- %% -->
## Child

Figure: Using `foo()` ^api-figure

![[sample.svg]]

See @[[#^api-figure]]. Body[^visible] <!-- comment
hidden[^hidden]
--> tail[^second]

[^visible]: First visible note
[^second]: Second visible note
[^hidden]: Not referenced outside comments
