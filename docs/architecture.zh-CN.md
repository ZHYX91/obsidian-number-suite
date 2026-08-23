---
doc_id: architecture
language: zh-CN
source_language: zh-CN
translation_status: source
status: stable
last_synced: 2026-08-23
---

# 架构

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

`heading-parser.ts` 返回 ATX 标题及源码偏移，并跳过 frontmatter、围栏代码、HTML/Obsidian
注释和块。`template-compiler.ts` 将占位符编译为用于渲染、校验和模板前缀识别的 AST。
`number-parser.ts` 对插件、模板和人工前缀提供来源、样式、规则及置信度；
`prefix-analysis.ts` 是显示与写入共享入口。

`numbering-engine.ts` 管理 H1-H6 计数、起始值、重置、空模板结构语义、排除和跨级策略。
`scheme-template-validation.ts` 在自定义方案保存前强制执行模板语义。

`document-semantics.ts` 是四种固定题注声明和显式同文件 `@` 引用的纯逻辑扫描器。它跳过受
保护 Markdown 区域，不创建 ID，把重复目标视为歧义，并为每份源文档重新开始四个独立题注
计数。`semantic-display-plan.ts` 将扫描结果与标题显示计划合并；标题引用只能消费最终确实
可见的序号，题注引用则只在题注显示开启时获得固定类型标签。

`note-semantics.ts` 解析默认/显式脚注和尾注，以首次引用顺序分别编号，并让
重复引用复用编号。它把两空格或 Tab 缩进的定义续行标记为受保护容器，使标题、题注和语义
引用扫描器不能消费笔记正文。缺失、重复或规范化冲突的定义不会进入显示计划。

<!-- section: display-adapters -->
## 显示适配层

每个 CodeMirror `EditorView` 拥有一个 `ViewPlugin`，确认扫描器候选与语法树一致，区分实时
预览和 Source Mode，并以 `Decoration.widget`/`Decoration.replace` 实现虚拟显示和隐藏。
选择触及标题或 IME composition 时移除隐藏装饰。每个视图缓存自己的有效 Properties；无效
YAML 可保留最后一次有效显示设置，但文件修改必须失败关闭。

阅读视图后处理器读取整篇源码并生成完整编号计划，再按
`MarkdownSectionInformation` 映射区块。只有源码与渲染标题数量和层级完全匹配时才修改 DOM；
隐藏前还会验证精确前导文本。标题内容不得传入 `innerHTML`。

题注和引用组件使用同一套 CodeMirror 生命周期与阅读视图全文缓存，但绝不进入
`TransformPlan` 或任何 Editor/Vault 修改路径。阅读视图保留原生 Obsidian 链接元素，只在
增强期间替换显式前导 `@`，清理时恢复该标记。嵌入 Markdown 按 `context.sourcePath` 键控，
计数与目标不会在宿主文件和嵌入源码之间泄漏。题注对齐使用独立的行或段落装饰，因此不依赖
是否存在虚拟题注编号。

脚注/尾注也只进入显示装饰计划。CodeMirror 替换引用与定义标记的可见标签；当选择范围触及
源码标记时撤销该处替换，使实体标记可编辑。注释组件把指针事件交回 CodeMirror。阅读视图
保留 Obsidian 原生脚注链接和列表结构，并在源码计划与渲染节点数量不完全一致时保持原样。
重新处理、视图切换或禁用插件时，清理逻辑恢复原有可见文本、ARIA 标签与列表值。

<!-- section: file-mutations -->
## 文件修改

当前笔记先生成不可变 `TransformPlan`，确认时复核文件、视图和源码，再用一次编辑器事务应用。
批处理先保存已打开编辑器、规划全部文件、显示聚合预览、复核全部源码、持久化有界恢复快照，
再通过精确内容条件替换执行。失败时只回滚仍保持插件写入结果的文件；任何并发编辑都会保留，
并使恢复记录继续可用。

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
- 架构、产品需求和 UX 的中文源修改必须同步英文并通过文档检查。
