---
doc_id: release
language: zh-CN
source_language: zh-CN
translation_status: source
status: stable
last_synced: 2026-08-13
---

# 发布策略

[English synced translation](release.en.md)

<!-- section: authority -->
## 文档权威性

本文是版本与公开发布治理的中文规范源，英文文件为同步译本。具体工作流实现可以变化，但不得
降低本文规定的准入和证据边界。

<!-- section: release-units -->
## 独立状态

以下状态必须分别报告：本地修改、本地提交、推送默认分支、创建不可变 tag、GitHub Release
发布、第三方插件市场状态、Vault 部署。完成前一项不授权或证明后一项。

<!-- section: versioning -->
## 版本与元数据

稳定版本使用不带 `v` 前缀的 `x.y.z`。`package.json`、`package-lock.json`、`manifest.json` 和
`versions.json` 必须一致。不能移动或重建已发布 tag；修复发布问题必须使用新版本。

<!-- section: preflight -->
## 发布前检查

1. 明确版本范围、用户可见变化、破坏性变化和已知限制。
2. 更新中英文稳定文档及 changelog，并通过双语与格式检查。
3. 在固定 Node.js/npm 下运行 `npm ci` 和 `npm run release:check`。
4. 使用最终候选资产在隔离 Vault 中验收所声明的每个平台，并记录环境与结果。
5. 记录候选提交和三个运行时资产的 SHA-256。
6. 提交预期源码，确认工作树没有未跟踪或未提交文件，从当前远端默认分支 HEAD 手动运行只读
   Release preflight，并输入计划版本；preflight 要求同版本远端 tag 与 Release 尚不存在。
7. preflight 通过后再创建并推送 tag。

自动门禁通过只证明源码和候选包合约，不得写成真实 Obsidian 或所有平台通过。

<!-- section: artifacts -->
## 发布资产

公开 Release 只包含 `main.js`、`manifest.json`、`styles.css` 和确定性的
`number-suite-x.y.z.zip`。ZIP 内使用 `number-suite/` 目录并包含同一组三个资产。
工作流交接可额外包含 `SHA256SUMS`，但它不属于公开资产集合。

<!-- section: publication -->
## 自动发布

推送数值 tag 后，GitHub Actions 在只读阶段验证 tag、默认分支祖先关系、固定工具链、依赖和
标准门禁，生成确定性资产并上传具有明确身份的交接 artifact。独立写权限阶段下载并验证同一
artifact、签发 provenance、创建 Release，再下载所有公开资产进行字节和 attestation 验证。

失败的 tag workflow 可以安全重跑。既有同 tag Release 只有在稳定、不可变、精确包含四个公共
资产、与当前候选逐字节一致，且四项 provenance 均绑定同一 tag 和 commit 时，才作为成功
no-op 接受。任何差异都会失败；workflow 不覆盖、编辑或追加同 tag 资产。

流程失败不等于 Release 成功；只有远端 Release 存在且最终验证完成后，才能报告公开发布。

<!-- section: deployment -->
## Vault 部署

Vault 部署不是 GitHub 发布步骤。只有获得明确目标 Vault 授权后，才可替换该 Vault 插件目录
中的三个运行时资产。部署前应记录或备份旧资产，必须保留 `data.json`，部署后逐文件验证
哈希。首次候选验收不得使用普通或正式 Vault。

<!-- section: rollback -->
## 失败与回滚

发布前失败只修复源码或候选并重新运行门禁。tag 已发布后不得移动；以新版本修复。Vault
部署回滚使用预先记录的旧运行时资产，不重置用户设置。任何远端、市场或部署状态无法现场
验证时，报告“未验证”，不能根据旧记录推断当前状态。

<!-- section: evidence-reporting -->
## 交付报告

报告版本、提交、是否 push/tag/Release、资产哈希、自动门禁、实际宿主矩阵、设备类型、市场
状态、Vault 部署目标和已知限制。单次运行证据保存在稳定文档之外，不得由一个证据层推断
另一个证据层。
