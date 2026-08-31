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

An ordinary tag push does not trigger publication. Commit, push, tag, workflow dispatch, GitHub
Release, and production-Vault deployment are separately authorized; DocWen delivery does not alter
this plugin's release boundary.

<!-- section: version-source -->
## Version and source

`manifest.json`, `package.json`, `package-lock.json`, and `versions.json` bind one canonical version
and exact commit/tree. A clean worktree must pass `npm run release:check`; a same-version tag must be
absent or already point at that commit.

<!-- section: candidate-bundle -->
## Candidate Bundle v3

The vendored release-core `2.0.0` and thin adapter create the sole Candidate Bundle v3 containing
`main.js`, `manifest.json`, `styles.css`, `number-suite-x.y.z.zip`, `SHA256SUMS`, and
`candidate-bundle.json`. It binds the toolchain, core/config/workflow, product payload, scenario
contract, and fixture hashes; there is no receipt or envelope dual stack.

<!-- section: product-acceptance -->
## Product acceptance

The same Bundle requires desktop and Android-emulator acceptance covering virtual numbering,
preview-first Write/Cleanup, captions, stable cross-references, reveal of only the selected source
among multiple same-line references, selection boundaries, and IME composition. Android physical
devices and iOS are out of scope.

<!-- section: standalone-workflow -->
## Standalone workflow

The generated, checked-in standalone workflow accepts only explicit `workflow_dispatch`. Its
read-only verify job performs one independent install and one complete `release:check` at the exact
commit, rebuilds the Bundle, and source-verifies it. The publish job downloads the fixed artifact
and performs transport verification without restoring `dist`.

<!-- section: publication-verification -->
## Publication and verification

The acceptance closure does not authorize publication; separate authorization binds the same
Bundle and closure. Before the first mutation, the workflow deeply validates the records, tag, and
read-only preflight. The public Release contains exactly the three loose assets and versioned ZIP;
`SHA256SUMS` and `candidate-bundle.json` remain in the private Bundle. Post-verification reads back
hosted bytes and provenance.

<!-- section: failure-deployment -->
## Failure, rollback, and deployment

An existing same-tag Release is a zero-write no-op only when exact; any difference fails without
overwrite and fixes use a new version. Production-Vault deployment requires separate authorization
for the exact Vault and preserves `data.json`; candidate, host, publication, and deployment verdicts
are reported separately.
