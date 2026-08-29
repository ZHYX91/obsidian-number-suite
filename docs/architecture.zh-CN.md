---
doc_id: architecture
language: zh-CN
source_language: zh-CN
translation_status: source
status: stable
last_synced: 2026-08-29
---

# Number Suite — 架构

[English synced translation](architecture.en.md)

<!-- section: authority -->
## 文档权威性

本文是架构边界的中文规范源，英文文件为同步译本。

<!-- section: system-shape -->
## 系统形态

```text
Markdown source
  -> context-aware ATX and frozen-semantic scanners
  -> template compiler + shared prefix analysis
  -> heading/caption numbering + per-kind note numbering + fail-closed reference resolution
  -> immutable transform plan OR non-writing display decoration plan
  -> Editor/Vault adapter OR Live Preview/Reading View adapter
```

编号核心和计划层保持纯逻辑；Obsidian、CodeMirror、DOM、Editor 和 Vault 只存在于适配层。
虚拟显示与文件写入不得各自实现编号规则。

<!-- section: core -->
## 核心与配置边界

`heading-parser.ts` 返回原生 ATX H1-H6 与精确的 H7-H9 扩展标题及源码偏移，并跳过
frontmatter、围栏代码、HTML/Obsidian 注释和块；10 个及以上井号不是标题。
`template-compiler.ts` 将占位符编译为用于渲染、校验和模板前缀识别的 AST。
`number-parser.ts` 对插件、模板和人工前缀提供来源、样式、规则及置信度；
`prefix-analysis.ts` 是显示与写入共享入口。

`numbering-engine.ts` 管理 H1-H9 计数、起始值、重置、空模板结构语义、排除和跨级策略。
`scheme-template-validation.ts` 在自定义方案保存前强制执行模板语义。

`document-semantics.ts` 是四种固定题注声明和显式同文件 `@` 引用的纯逻辑扫描器。它跳过受
保护 Markdown 区域，不创建 ID，把重复目标视为歧义，并为每份源文档重新开始四个独立题注
计数。`semantic-display-plan.ts` 将扫描结果与标题显示计划合并；标题名和完整类型化题注名
共用一个候选集合，因此必须只剩一个目标。引用标签使用别名或目标题名，只在最终存在可见
标题/题注编号时带上编号。

`note-semantics.ts` 解析默认/显式脚注和尾注，以首次引用顺序分别编号，并让
重复引用复用编号。它把两空格或 Tab 缩进的定义续行标记为受保护容器，使标题、题注和语义
引用扫描器不能消费笔记正文。缺失、重复或规范化冲突的定义不会进入显示计划。

`document-outline.ts` 是基于已认证 H1-H9 解析器、题注扫描器和标题显示计划的纯逻辑投影。
它按源码层级嵌套标题，把题注归入前方最深标题，只从显示标签末尾去掉用户写入的块 ID，并
输出用于跳转的源码行；它既不读取 Vault，也不写入 Markdown。

<!-- section: interop-api -->
## 消费者互通 API

插件公开 `number-suite.interop.v2` 只读 API。消费者提交源文档和已清洗的笔记覆盖后，API
返回 JSON 可序列化的中性快照：UTF-16 源码范围、标题与题注目标、解析后的同文件引用、实际启用的
显示片段和计数器。不暴露 Obsidian、CodeMirror、DOM 或 Number Suite 私有类，也不执行文件写入。
快照与当前显示计划共用解析器和编号引擎，避免消费者重新猜测编号。若存储前缀需要隐藏但消费者
无法表达“删除存储前缀”，相应标题不会伪装成可无损物化；消费者必须失败关闭或采用自己的安全回退。

被完全忽略的笔记返回 `disabled: true`，并将标题、题注和引用数组全部置空。每个导出目标的
UTF-16 范围覆盖完整物理源码行，但不包含换行符。`authoredText` 去掉末尾块 ID，因此
`Equation: ^energy` 这类合法的仅 ID 题注可以为空。`targetId` 只报告恰好一个无歧义的用户所写
ID，支持行内位置和受支持的下一独立行位置；ID 重复或同一目标存在多个候选时失败关闭为 `null`，
通过重复 ID 的引用不输出。显示 literal 保留 Number Suite 的通用模板边界，包括百分号和超过 32 字符的
literal；更窄的消费格式必须在自己的适配层校验。题注视觉上下位置、对齐、胶囊和 Tooltip 均不
改变这些源码事实。

<!-- section: display-adapters -->
## 显示适配层

`NumberSuiteSidebarView` 是右侧一个常驻 `ItemView`，内部有两个选项卡。大纲选项卡在唯一可用
时读取活动编辑器，否则使用 Vault 缓存读取，再渲染纯逻辑大纲投影；当前笔记选项卡持有可复用
控制面板，不再使用弹窗。Workspace 的文件、leaf、编辑器和 Vault 修改事件只刷新相关活动
选项卡，所选选项卡保存为视图状态。导航优先复用已有 Markdown leaf，否则在投影给出的源码
行打开文件。

每个 CodeMirror `EditorView` 拥有一个 `ViewPlugin`，确认扫描器候选与语法树一致，区分实时
预览和 Source Mode，并以 `Decoration.widget`/`Decoration.replace` 实现虚拟显示和隐藏。
选择触及标题或 IME composition 时移除隐藏装饰。每个视图缓存自己的有效 Properties；无效
YAML 可保留最后一次有效显示设置，但文件修改必须失败关闭。

对于扩展的 7～9 级，CommonMark 不提供原生语法树节点，因此语法树适配器只信任经过同一
受保护区域扫描器认证的候选。Live Preview 添加行样式，并在非活动编辑、非 composition 状态
隐藏标记；Source Mode 保持标记可见。

阅读视图后处理器读取整篇源码并生成完整编号计划，再按
`MarkdownSectionInformation` 映射区块。只有源码与渲染标题数量和层级完全匹配时才修改 DOM；
隐藏前还会验证精确前导文本。标题内容不得传入 `innerHTML`。H7-H9 行必须映射为独立段落，
且可见前缀仍含精确扩展标记，否则该区块失败关闭。

题注和引用组件使用同一套 CodeMirror 生命周期与阅读视图全文缓存，但绝不进入
`TransformPlan` 或由显示触发的 Editor/Vault 修改路径。`caption-objects.ts` 认证独立图片、
Markdown 表格、块公式和围栏代码块，并将题注类型与承载对象类型解耦。候选图允许零或一个
间隔空行，只输出一对一绑定；两个空行或任一侧多候选时失败关闭。对象归属范围可以包含随后
的块 ID，独立视觉范围则止于真实渲染对象边界；图片替换文字与文件名建议保持分离。题注替换
把整条源码渲染为一个组件；选择触及该行时撤销替换，恢复精确源码。所有绑定题注由直接提供
装饰的 CodeMirror `StateField` 作为块组件锚定在对象视觉范围上方或下方，紧凑间距来自组件
内部 padding，源码与对象范围保持不变；未绑定题注保留行内组件。引用装饰把完整视觉源码替换为可聚焦胶囊，并携带精确
源码行目标。阅读视图保留原生 Obsidian 链接元素，同时保存原文本、ARIA 和移除的 `@`，清理
时全部恢复。嵌入 Markdown 按 `context.sourcePath` 键控，
计数与目标不会在宿主文件和嵌入源码之间泄漏。题注对齐和视觉位置不依赖是否存在虚拟题注
编号；阅读视图按真实对象类型寻找承载对象，并用稳定注释锚点恢复题注移动前的 DOM 位置。图片与图题的提示元数据交给文档级结构化
提示控制器，并在清理时删除。

脚注/尾注也只进入显示装饰计划。CodeMirror 替换引用与定义标记的可见标签；当选择范围触及
源码标记时撤销该处替换，使实体标记可编辑。注释组件把指针事件交回 CodeMirror。阅读视图
保留 Obsidian 原生脚注链接和列表结构，并在源码计划与渲染节点数量不完全一致时保持原样。
重新处理、视图切换或禁用插件时，清理逻辑恢复原有可见文本、ARIA 标签与列表值。

<!-- section: file-mutations -->
## 文件修改

当前笔记先生成不可变 `TransformPlan`，确认时复核文件、唯一匹配的编辑器视图和源码，再用
一次编辑器事务应用；即使操作从已获得焦点的侧栏发起也保持该约束。
批处理先保存已打开编辑器、规划全部文件、显示聚合预览、复核全部源码、持久化有界恢复快照，
再通过精确内容条件替换执行。失败时只回滚仍保持插件写入结果的文件；任何并发编辑都会保留，
并使恢复记录继续可用。

题名右键操作使用独立的纯 `CaptionInsertionPlan`。扫描器只接受真实右键位置（光标作为回退）
的独立图片语法、经过验证的顶层 Markdown 表格、块公式或围栏代码块，排除行内、单元格内和
受保护容器，并在相邻位置已有任意语义类型题注时不提供操作。相邻关键词仅大小写错误时生成有界修正
计划；图片下方的旧 Figure 生成有界迁移计划。弹窗采集并预览单行题名；确认
时复核文件路径、完整编辑器源码和原目标，再应用精确的一处编辑器变更。

`StructuralTableCaptionMenuBridge` 只观察 Structural Tables 公开的渲染宿主类和
`data-structural-source-table-index` 标记。它把同一操作加入 `Menu.forEvent`，再由 Number Suite
自己的 Markdown 表格扫描器映射该序号并保留多行表头；宿主、Markdown 视图、序号或源码表格
任一项无法解析时均失败关闭。Number Suite 不导入 Structural Tables 代码，并保持独立可安装。

稳定引用右键操作使用独立的纯 `StableReferencePlan`，只识别真实右键位置的标题或固定题注。
已有行内或紧随其后的块 ID 时不写入；否则在合法目标位置生成防冲突块 ID（题注行内、标题下一
行）、精确前后预览和带可读别名的
`@[[#^id|题名]]` 链接。确认时复核文件、全文源码、目标和生成 ID，再应用一次编辑器事务；剪贴
板写入只发生在用户明确触发该操作之后。

<!-- section: persistence -->
## 持久化

`data.json` 只保存 schema-versioned 设置。串行保存协调器合并频繁更新，并暴露待保存、失败和
重试状态。最近批处理快照单独保存在 `recovery.json`；设置重置不得删除它。自定义方案修改或
删除前的模板进入清理历史，直至用户明确清除。

<!-- section: release-boundary -->
## 构建与发布边界

构建将 Obsidian 和 CodeMirror 宿主模块 externalize，只产生 `dist/main.js`、
`dist/manifest.json` 和 `dist/styles.css`。源码门禁、候选包契约和版本契约不能替代隔离 Vault
中的宿主验收。发布流程见[发布策略](release.zh-CN.md)。

<!-- section: change-rules -->
## 变更规则

- `src/core` 不得导入 Obsidian、浏览器全局或 Node 运行时模块。
- 文件写入只能消费经过预览和过期校验的不可变计划。
- 扩大清理识别前必须先增加误报测试。
- 新设置必须有清洗、克隆、持久化和 UI 合约。
- 互通 schema 变更必须升级版本，并保持返回值为宿主无关的纯数据。
- 架构、产品需求和 UX 的中文源修改必须同步英文并通过文档检查。
