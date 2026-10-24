# Number Suite

[English](../../README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [Tiếng Việt](README.vi.md) · [العربية](README.ar.md)

Number Suite 可在 Obsidian 的標題、圖表標題、參照、註腳與章末註記旁顯示編號。只在畫面上顯示時，不會修改 Markdown；要把編號寫入檔案，得另行執行操作。

這是常用操作的**簡明指南**。H7–H9、題注與物件綁定、穩定參照及註腳的完整說明，請看[英文進階指南](../advanced.en.md)或[簡體中文進階指南](../advanced.zh-CN.md)。

<!-- section: installation -->
## 安裝

需要 Obsidian 1.12.7 或更新版本。支援桌面版與 Android；iOS 尚未驗證。

1. 在 Obsidian 的「設定 → 社群外掛 → 瀏覽」搜尋 Number Suite，安裝後啟用。
2. 手動安裝時，從同一個 [GitHub Release](https://github.com/ZHYX91/obsidian-number-suite/releases) 下載版本 ZIP，解壓後將 `number-suite` 資料夾放進 `.obsidian/plugins/`。也可以把同一版本的 `main.js`、`manifest.json` 和 `styles.css` 放進 `.obsidian/plugins/number-suite/`。
3. 重新載入 Obsidian 並啟用外掛。請勿混用不同版本的檔案。

<!-- section: quick-start -->
## 快速上手

1. 在 **設定 → Number Suite → 標題編號** 開啟「顯示虛擬編號」。
2. 回到即時預覽或閱讀檢視，標題旁就會顯示編號，但原始文字保持不變。
3. 若要將編號寫入檔案，請在右側 **Number Suite → 目前筆記** 選擇寫入或重新編號，檢查預覽後再確認。

「目前筆記」內的「顯示與檔案操作」說明列出原文、目標及操作。單篇筆記的顯示選項會存入 Properties，但顯示本身不改寫標題。預覽依檔案折疊，檔名旁顯示變更與警告數量；展開後可繼續載入全部結果。停用外掛會停止新的批次或復原寫入，已送出的寫入仍可能完成。若無法安全撤銷，請保留外掛目錄的 `recovery.json`，先檢查筆記。

<!-- section: captions -->
## 圖表標題與參照

在獨立圖片、表格、公式或程式碼區塊上方加一行題注，開頭必須是固定英文關鍵字 `Figure:`、`Table:`、`Equation:` 或 `Code:`。題注會顯示成標籤，並可附上編號。在同一篇筆記內，`@[[#標題]]` 會顯示成可點擊的參照；普通 `[[#標題]]` 連結不會改變。註腳 `[^id]` 和章末註記 `[^endnote:id]` 會分開編號。

```markdown
Figure: Architecture

![[architecture.png]]
```

移動題注或修正關鍵字大小寫時，原有的行內與獨立區塊 ID 會跟著題注保留，既有區塊引用仍指向同一題注。

<!-- section: numbering -->
## 編號樣式與檔案安全

可以選用階層編號、公文與法律文件形式，以及繁體中文、日文、韓文、阿拉伯—印度數字等樣式範例。切換介面語言不會自動切換樣式，選擇樣式也不會寫入 Markdown。寫入、移除、重新編號、建立題注和新增參照 ID 等操作則可能修改檔案。標題文字變動可能使舊連結失效，請檢查預覽並備份重要筆記。7–9 級標題使用擴充語法，其他 Markdown 編輯器不一定認得。

<!-- section: settings -->
## 在哪裡調整設定

全域設定的七個頁籤為：一般、標題編號、題註、交叉參照、註腳與章節附註、寫入與清理、顯示與批次處理。介面語言與編號樣式分開選擇。右側欄的「目前筆記」可只覆寫這一篇；選回「跟隨全域」便移除該項覆寫，其他 Properties 不變。側欄也提供文件大綱和唯讀標題心智圖，方便跳到原文。

<!-- section: limitations -->
## 使用範圍與限制

- 一篇 Markdown 筆記使用一套編號規則；題注和交叉引用也只在同一檔案內計算。
- 清單、引言、程式碼範例、HTML 區塊和 frontmatter 裡的標題或題注不參與文件編號。一般清單文字中的腳注與交叉引用仍可使用。
- 對 Structural Tables 的表格，只有能確認檔案、原文與範圍時才提供題注操作。舊版或不支援的表格會顯示停用提示；請在原始碼模式手動新增或編輯題注。
- H7–H9 是 Number Suite 與 DocWen 的擴充語法。Obsidian 內建大綱和標題連結不一定識別；可使用穩定區塊 ID。

<!-- section: privacy-and-support -->
## 隱私與協助

外掛在本機執行，不連網、不收集遙測。顯示編號不會寫入筆記；寫入、清理和重新編號需先檢查預覽。修改標題文字可能影響既有標題連結。回報問題時請附版本、操作步驟和不含私人資料的最小 Markdown 範例。

[完整英文使用指南](../../README.md) · [回報問題](https://github.com/ZHYX91/obsidian-number-suite/issues/new/choose) · [MIT 授權](../../LICENSE)
