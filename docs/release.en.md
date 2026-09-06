---
doc_id: release
language: en
source_language: zh-CN
translation_of: release.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-08-31
---

# Number Suite — Release procedure

[中文规范源](release.zh-CN.md)

This document defines the repeatable Number Suite release process. Source, the Candidate Bundle,
real Obsidian acceptance, GitHub publication, and production-Vault deployment are independent
states.

<!-- section: boundaries -->
## Boundaries

An authorized stable version tag push triggers publication. Manual dispatch on the same tag supports verify-only or publish mode through the same workflow. Host acceptance is optional; publishing does not deploy to a Vault.

<!-- section: version-source -->
## Version and source

`manifest.json`, `package.json`, `package-lock.json`, and `versions.json` bind one canonical version
and exact commit/tree. A clean worktree must pass `npm run release:check`; a same-version tag must be
absent or already point at that commit.

<!-- section: candidate-bundle -->
## Candidate Bundle v3

The vendored release-core `3.0.1` and thin adapter create the sole Candidate Bundle v3 containing
`main.js`, `manifest.json`, `styles.css`, `number-suite-x.y.z.zip`, `SHA256SUMS`, and
`candidate-bundle.json`. It binds the toolchain, core/config/workflow, product payload, scenario
contract, and fixture hashes; there is no receipt or envelope dual stack.

<!-- section: product-acceptance -->
## Optional product acceptance

Use the same Bundle for desktop and Android-emulator acceptance covering virtual numbering,
preview-first Write/Cleanup, captions, stable cross-references, reveal of only the selected source
among multiple same-line references, selection boundaries, and IME composition. Android physical
devices and iOS are out of scope.

<!-- section: standalone-workflow -->
## Standalone workflow

Tag push and manual dispatch use the same build, publish, and post-verification jobs. The read-only build job produces and verifies the Bundle. Publication downloads that fixed artifact without rebuilding and verifies the event, tag, commit, and Bundle digest before writing. Manual verify mode performs no publication.

<!-- section: publication-verification -->
## Publication and verification

Actions generates SLSA build provenance for the four public assets. The publisher verifies their source, tag and workflow, creates a draft, downloads and checks all draft assets, then publishes the immutable Release. A separate job checks the hosted release. Only the three loose files and versioned ZIP are public assets; Bundle metadata stays in the CI artifact. GitHub publication and Community Directory review are separate outcomes.

<!-- section: failure-deployment -->
## Failure, rollback, and deployment

An existing same-tag Release is a zero-write no-op only when exact; any difference fails without
overwrite and fixes use a new version. Production-Vault deployment requires separate authorization
for the exact Vault and preserves `data.json`; candidate, host, publication, and deployment verdicts
are reported separately.
