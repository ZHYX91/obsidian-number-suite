---
title: Code fence boundaries
---
```js
const frontmatterValue = 1;
```
Code: Frontmatter sample


# Adjacent code blocks

```js
const firstValue = 1;
```
~~~js
const secondValue = 2;
~~~


# Protected note code

Notes[^plain], typed footnotes[^footnote:typed] and endnotes[^endnote:typed].

[^plain]: Plain note
  ```js
  const plainProtected = 1;
  ```

[^footnote:typed]: Typed footnote
   ~~~js
   const footnoteProtected = 2;
   ~~~

[^endnote:typed]: Typed endnote
  ```js
  const endnoteProtected = 3;
  ```


# Protected lookalikes

<!--
```js
const commentProtected = 4;
```
-->

<div>
~~~js
const htmlProtected = 5;
~~~
</div>


# Final visible heading
