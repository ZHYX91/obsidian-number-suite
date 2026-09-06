---
doc_id: release
language: zh-CN
source_language: zh-CN
translation_status: source
status: stable
last_synced: 2026-08-31
---

# Number Suite — 发布流程

[English synced translation](release.en.md)

本文定义 Number Suite 的可重复发布流程。源码、Candidate Bundle、真实 Obsidian 验收、GitHub
发布与正式 Vault 部署是独立状态。

<!-- section: boundaries -->
## 边界

获授权的稳定版本 tag push 触发发布。也可在同一 tag 上手动派发，选择只验证或发布，两种入口共用工作流。宿主验收可选；发布不会部署到 Vault。

<!-- section: version-source -->
## 版本与源码

`manifest.json`、`package.json`、`package-lock.json` 与 `versions.json` 必须绑定同一规范版本和精确
commit/tree。干净工作树必须通过 `npm run release:check`，同名 tag 只能不存在或已指向该提交。

<!-- section: candidate-bundle -->
## Candidate Bundle v3

vendored release-core `3.0.1` 与薄 adapter 创建唯一 Candidate Bundle v3，包含 `main.js`、
`manifest.json`、`styles.css`、`number-suite-x.y.z.zip`、`SHA256SUMS` 与
`candidate-bundle.json`。Bundle 绑定工具链、core/config/workflow、产品 payload、场景合同及
fixture 哈希，不存在 receipt 或 envelope 双栈。

<!-- section: product-acceptance -->
## 可选产品验收

使用同一 Bundle 开展桌面与 Android 模拟器验收，覆盖虚拟编号、preview-first Write/Cleanup、
题注、稳定交叉引用、同一行多个引用只恢复当前引用、选择区边界和 IME composition。Android
真机与 iOS 不在范围内。

<!-- section: standalone-workflow -->
## 独立工作流

tag push 与手动派发共用构建、发布和发布后验证任务。只读构建任务生成并验证 Bundle；发布任务下载同一固定资产，不重复构建，在写入前验证事件、tag、提交和 Bundle 摘要。手动 verify 模式不执行发布。

<!-- section: publication-verification -->
## 发布与核验

Actions 为四个公开资产生成 SLSA 构建证明。发布器核对其源码、tag 和工作流，创建草稿，下载并检查全部草稿资产，然后正式发布 immutable Release。独立任务再检查已发布资产。公开附件仅为三个松散文件和版本 ZIP；Bundle 元数据保留在 CI artifact 中。GitHub 发布结果与 Community Directory 审核结果分别记录。

<!-- section: failure-deployment -->
## 失败、回退与部署

既有同 tag Release 只有完全一致时才是零写 no-op；任何差异都失败且不得覆盖，修复使用新版本。
正式 Vault 部署需对精确 Vault 单独授权并保留 `data.json`；候选、宿主、发布与部署结论分别报告。
