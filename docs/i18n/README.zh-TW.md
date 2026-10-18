# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite 可在 Obsidian 的標題、圖表標題、參照、註腳與章末註記旁顯示編號。只在畫面上顯示時，不會修改 Markdown；要把編號寫入檔案，得另行執行操作。

## 快速上手

1. 在 **設定 → Number Suite → 標題編號** 開啟「顯示虛擬編號」。
2. 回到即時預覽或閱讀檢視，標題旁就會顯示編號，但原始文字保持不變。
3. 若要將編號寫入檔案，請在右側 **Number Suite → 目前筆記** 選擇寫入或重新編號，檢查預覽後再確認。

## 圖表標題與參照

在獨立圖片、表格、公式或程式碼區塊上方加一行題注，開頭必須是固定英文關鍵字 `Figure:`、`Table:`、`Equation:` 或 `Code:`。題注會顯示成標籤，並可附上編號。在同一篇筆記內，`@[[#標題]]` 會顯示成可點擊的參照；普通 `[[#標題]]` 連結不會改變。註腳 `[^id]` 和章末註記 `[^endnote:id]` 會分開編號。

```markdown
Figure: Architecture

![[architecture.png]]
```

## 編號樣式與檔案安全

可以選用階層編號、公文與法律文件形式，以及繁體中文、日文、韓文、阿拉伯—印度數字等樣式範例。切換介面語言不會自動切換樣式，選擇樣式也不會寫入 Markdown。寫入、移除、重新編號、建立題注和新增參照 ID 等操作則可能修改檔案。標題文字變動可能使舊連結失效，請檢查預覽並備份重要筆記。7–9 級標題使用擴充語法，其他 Markdown 編輯器不一定認得。

## 安裝與完整說明

支援 Obsidian 1.12.7 以上的桌面版與 Android；iOS 尚未驗證。可從社群外掛目錄安裝，或將同一個 GitHub Release 的 `main.js`、`manifest.json` 和 `styles.css` 放到 `.obsidian/plugins/number-suite/`。外掛完全在本機運作，不收集遙測資料。進階模板及完整限制請參閱[英文詳細說明](../../README.md)。

[Issues](https://github.com/ZHYX91/obsidian-number-suite/issues)
