# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite は Obsidian の見出し、キャプション、参照、脚注、文末脚注に番号を表示するプラグインです。画面に番号を表示するだけなら Markdown は変更されません。ファイルへの書き込みは別の操作です。

## 使い始める

1. **設定 → Number Suite → 見出し番号** で、仮想番号の表示（`Show virtual numbers`）をオンにします。
2. ライブプレビューか閲覧ビューを開きます。見出しの番号は表示されますが、ノートの本文はそのままです。
3. 番号を Markdown に保存する場合は、右側の Number Suite パネルで現在のノートを選び、書き込みまたは振り直しを実行します。プレビューを確認してから確定してください。

## キャプションと参照

画像、表、独立した数式、コードブロックの上に `Figure:`、`Table:`、`Equation:`、`Code:` で始まる行を書きます。キーワードは英語のまま使います。キャプションには画面上で番号を付けられます。同じノートの見出しやキャプションへの参照は `@[[#見出し]]` と書きます。通常の `[[#見出し]]` リンクは変わりません。脚注 `[^id]` と文末脚注 `[^endnote:id]` は別々に番号が付きます。

```markdown
Figure: Architecture

![[architecture.png]]
```

## 番号形式とファイルの安全性

階層番号のほか、公文書・法律文書向けの形式例、繁体字中国語・日本語・韓国語・アラビア・インド数字の形式例があります。表示言語を変更しても番号形式は自動では変わりません。形式を選ぶだけでは本文も変わりません。一方、番号の書き込み・削除・振り直し、キャプションや参照 ID の作成はファイルを変更する場合があります。見出しへのリンクが切れるおそれがあるため、プレビューとバックアップを確認してください。見出しレベル 7〜9 は拡張記法です。

## インストールと詳しい説明

Obsidian 1.12.7 以降のデスクトップ版・Android 版に対応します。iOS は未検証です。コミュニティプラグインからインストールするか、同じ GitHub Release の `main.js`、`manifest.json`、`styles.css` を `.obsidian/plugins/number-suite/` に配置してください。利用状況の送信は行いません。テンプレートと制限事項は[英語の詳しいガイド](../../README.md)をご覧ください。

[Issues](https://github.com/ZHYX91/obsidian-number-suite/issues)
