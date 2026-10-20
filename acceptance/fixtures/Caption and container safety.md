# Visible before

- ```markdown
  # Hidden code heading
  Figure: Hidden caption ^hidden-caption
  ```

- Item

  ## Hidden list heading

> ### Hidden quote heading

# Visible after

See @[[#^caption-id|the image]] and @[[#^table-two|the second table]].

![[square-edge.svg]]
^image-id

figure: Preserved image ^caption-id

Ordinary text separates the image and the tables.

| Name | Value |
| --- | --- |
| Same | 00123 |

Text between the byte-identical tables.

| Name | Value |
| --- | --- |
| Same | 00123 |

table: Second table ^table-two

Text before the protected relocation example.

![[sample.svg]]
^object-one
^object-two

Figure: Do not move across a second object ID

# Final visible heading
