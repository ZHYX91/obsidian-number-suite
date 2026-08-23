# Structured Numbering

[English](../../README.md)

Structured Numbering 将 Markdown 工具经常混在一起的两个决定分开：标题序号是否写入 Markdown
文件，以及这些序号是否在 Obsidian 中可见。它可以写入、移除、虚拟显示或视觉隐藏标题
序号，不访问网络，也不收集遥测。

初始版本：`0.1.0`。自动门禁、候选包检查和带日期的 Obsidian 验收记录是彼此独立的证据。

<!-- section: features -->
## 功能

- 在实时预览和阅读视图中显示计算序号，不修改 Markdown。
- 视觉隐藏可靠识别的实体序号，同时保持源文件不变且可访问。
- 同时启用虚拟显示和隐藏，将一个可靠识别的实体前缀替换为计算序号。
- 预览后对当前笔记执行写入、清理或重新编号。
- 通过内容过期保护、有界恢复数据和冲突安全回滚处理文件夹或整个库。
- 使用层级数字、中文公文和法律条文内置方案。
- 创建多个自定义方案，使用经过校验的 H1-H6 模板，并保留历史模板用于清理。
- 精确排除单个标题或整个标题子树，且不占用序号。
- 为 `Figure:`、`Table:`、`Equation:` 和 `Code:` 题注显示纯虚拟编号；四种类型在每个
  Markdown 文件内分别从 1 开始，题注无需 ID 也可编号。
- 可分别设置四种题注是否居中；Figure 和 Equation 默认居中，Table 和 Code 默认跟随
  当前主题。
- 只在已有目标具备可见有效编号时增强显式同文件 `@[[#标题]]`、`@[[#^块ID]]` 及其别名。
- 为 `[^id]`、`[^footnote:id]` 和 `[^endnote:id]` 显示脚注 `1、2、3` 与尾注
  `E1、E2、E3`；重复引用复用首次编号。
- 按笔记覆盖显示、隐藏、方案、清理范围、起始值，或完全退出插件处理。
- 使用英文或简体中文界面。

<!-- section: requirements-and-compatibility -->
## 要求与兼容性

- Obsidian `1.12.7` 或更高版本。
- 初始版本仅支持桌面端；取得带日期的移动端验收记录后再开放移动端加载。
- 每个平台的支持声明都需要对应于准确候选版本的带日期运行时记录。
- 自动测试不能证明宿主行为。参见[测试策略](../testing-strategy.zh-CN.md)和非权威的
  [运行时检查清单](../ACCEPTANCE.md)。

<!-- section: installation -->
## 安装

### 第三方插件市场

初始条目通过审核后，在 Obsidian 中打开**设置 → 第三方插件 → 浏览**，搜索
**Structured Numbering**，安装并启用。

### 手动安装

从同一个 GitHub Release 下载 `main.js`、`manifest.json` 和 `styles.css`，将三个文件放入
`.obsidian/plugins/structured-numbering/`，然后重新加载 Obsidian 并启用插件。不要混用不同
版本的文件。

<!-- section: usage -->
## 使用方法

| 源文件状态 | 期望结果 | 操作 | 是否修改 Markdown |
|---|---|---|---|
| 没有实体序号 | 只在 Obsidian 中显示 | 开启虚拟序号 | 否 |
| 没有实体序号 | 保存计算序号 | 写入标题序号 | 是 |
| 已有实体序号 | 只在界面隐藏 | 开启隐藏 | 否 |
| 已有实体序号 | 替换为计算显示序号 | 同时开启虚拟序号和隐藏 | 否 |
| 已有实体序号 | 从文件移除 | 清理标题序号 | 是 |

通过功能区图标或“打开当前笔记控制面板”命令设置当前笔记的显示和方案。所有文件修改命令
都会先显示预览。写入或移除序号会改变标题文本，可能使 `[[笔记#标题]]`、标题嵌入或外部
锚点失效；插件不会猜测并重写这些链接。

题注与交叉引用显示从不写入 Markdown。题注必须是以 `Figure:`、`Table:`、`Equation:` 或
`Code:` 精确开头的顶层段落；`Listing:` 不是兼容别名。插件只消费用户已有的 Obsidian 标题
链接和块 ID，不创建、校验、迁移、修复或管理锚点。普通 `[[#...]]` 链接完全交由 Obsidian。
题注对齐独立于题注编号。Figure 和 Equation 默认居中；可在“题注”选项卡中分别调整四种
固定题注类型。

### 同文件交叉引用

打开 **设置 → Structured Numbering → 交叉引用**，开启**显示同文件交叉引用编号**。在
Obsidian 的同文件标题链接或块链接前加上 `@`。目标必须已经具备可见且有效的编号：可以开启
虚拟标题序号，保留一个可可靠识别的可见实体标题序号，或者为题注块目标开启虚拟题注编号。

```markdown
## 安装

请参见 @[[#安装]] 或 @[[#安装|安装章节]]。

Figure: 系统架构 ^fig-architecture

请参见 @[[#^fig-architecture]] 或 @[[#^fig-architecture|系统架构图]]。
```

如果标题显示为 `1`、题注显示为 `Figure 1`，以上引用会分别显示为 `1 安装`、`1 安装章节`、
`Figure 1 fig-architecture` 和 `Figure 1 系统架构图`。只有前导 `@` 的视觉呈现会被替换；
Obsidian 原生链接、别名、跳转目标、块 ID 和 Markdown 源码均保持不变。

普通 `[[#...]]` 链接、跨文件链接、缺失或重复的目标，以及没有可见有效编号的目标都会保持
原样。引用和目标必须位于同一个 Markdown 文件。

### 脚注与尾注

类型化注释显示同样不修改 Markdown。`[^id]` 和 `[^footnote:id]` 属于脚注，显示为
`1、2、3`；`[^endnote:id]` 属于尾注，显示为 `E1、E2、E3`。两种计数器在每个文件内分别
从 1 开始，并按首次引用顺序编号；重复引用复用首次编号。

“脚注与尾注”设置选项卡可以让 Live Preview 保留原始标记，或用格式化编号替换。采用
格式化编号时，单击显示编号或把光标移到编号处，即可展开并编辑实体标记。阅读模式继续保留
带编号的原生跳转。定义缺失、重复、冲突或渲染不匹配时保持 Obsidian 原样。采用两个空格
缩进的多行注释正文不会进入标题、题注或语义引用扫描。

<!-- section: settings -->
## 设置

所有受支持的 Obsidian 版本统一使用一套无障碍七选项卡设置界面：常规、标题编号、题注、
交叉引用、脚注与尾注、写入与清理、显示与批处理。

### 序号方案

模板使用 `{标题层级.数字格式}` 占位符，例如 `{1.arabic}` 或 `{2.chinese_lower}`。支持
阿拉伯数字、全角阿拉伯数字、中文小写/大写、带圈数字、拉丁字母大写/小写和罗马数字
大写/小写。

空的 Hn 模板不输出序号，但该标题仍属于结构：它会增加本层计数、重置更深层计数，并可由
后代模板引用。非空 Hn 模板必须包含 Hn 占位符，且不能引用更深层级。编号核心以方案模板
作为逐层规则。

自定义方案可以精确排除逻辑标题。排除整个子树会跳过标题及其全部后代；仅排除标题时，后代
采用所选的跨级策略。排除不支持模糊匹配或正则表达式。

### 清理与来源标记

默认清理范围识别来源标记、当前及已停用的内置/自定义历史模板。更宽的常见人工序号范围
需要主动选择并经过预览。默认会保留有歧义的小数、版本号、年份、日期和单位数量前缀。

可选的 U+2060 来源标记可精确标识插件写入的序号。它属于实验功能且默认关闭，因为不可见
字符可能影响互操作、复制文本和标题链接。专用命令可以移除标记而保留可见序号。

### 按笔记 Properties 覆盖

当前笔记面板显示全局值、覆盖值和最终生效值。未修改的笔记不会得到插件 Properties。
将控制项改回“跟随全局”会删除对应属性；“全部恢复”会移除全部 Structured Numbering 覆盖，
并保留无关 Properties。

```yaml
---
structured-numbering-show-virtual: true
structured-numbering-conceal-stored: true
structured-numbering-scheme: hierarchical-h2
structured-numbering-clean-scope: templates
structured-numbering-start:
  h2: 3
---
```

`structured-numbering-ignore: true` 让当前笔记退出显示和文件操作。

<!-- section: limitations -->
## 限制

- 一个 Markdown 文件只有一套最终生效的序号方案，不支持章节局部切换方案。
- 题注计数和语义引用解析也以单个 Markdown 文件为作用域。嵌入文件使用自己的源码和计数；
  不识别跨文件语义引用。
- 脚注和尾注采用彼此独立的文件级计数器。注释锚点、导航、布局和定义渲染仍由 Obsidian
  管理；插件只改变经过校验的可见标签。
- 只处理顶层 ATX H1-H6 标题。Setext 标题、块引用、列表、注释、frontmatter、围栏代码和
  HTML 块都不是编号目标。
- `0.1.0` 不包含 Canvas、Outline、Backlinks、Search Results 或 PDF 导出集成。
- Source Mode 装饰默认关闭，使实体 Markdown 始终直接可见。
- 阅读视图隐藏只改变可见文本，不改变标题 DOM `id`；锚点仍跟随实体标题。
- 如果第三方渲染器改变标题数量或层级，阅读视图会对该区块失败关闭。

<!-- section: privacy-and-security -->
## 隐私与安全

Structured Numbering 完全在本地运行，不包含联网、遥测、分析、广告、远程字体或远程资源。虚拟
显示和视觉隐藏路径不会调用文件写入 API。

当前笔记修改使用一次编辑器事务。批处理会预览全部目标、重新校验精确内容、保存有界恢复
数据，并避免覆盖并发编辑。这些保护能够降低风险，但不能说明适合直接在普通或正式 Vault
中进行首次验收。验收应使用隔离测试 Vault。

请通过 [GitHub Security Advisories](../../SECURITY.md) 报告安全或数据丢失问题，不要附带
私有 Vault 内容。

<!-- section: development -->
## 开发

使用 Node.js `24.19.0` 和 npm `11.17.0`。

```bash
npm ci
npm run check
```

`npm run check` 验证固定运行时、格式、双语 README 和稳定文档契约、lint、严格 TypeScript、
覆盖率阈值、生产 bundle 以及精确发布布局。它属于源码/候选包证据，不等于 Obsidian 运行时
验收。

稳定项目文档：

- [产品需求](../product-requirements.zh-CN.md)
- [UX 规格](../ux-spec.zh-CN.md)
- [架构](../architecture.zh-CN.md)
- [测试策略](../testing-strategy.zh-CN.md)
- [发布策略](../release.zh-CN.md)

治理与项目历史：

- [贡献指南](../../CONTRIBUTING.md)
- [安全策略](../../SECURITY.md)
- [变更记录](../../CHANGELOG.md)

<!-- section: support -->
## 支持

请通过 [GitHub Issues](https://github.com/ZHYX91/obsidian-structured-numbering/issues) 报告可复现问题
或提出功能建议。请提供插件和 Obsidian 版本、操作系统、最小化的合成 Markdown、所选方案及
精确操作。不要附带私有 Vault 内容。

<!-- section: license -->
## 许可证

[MIT](../../LICENSE)
