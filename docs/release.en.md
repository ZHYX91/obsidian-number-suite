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

<!-- section: authority -->
## Document authority

The Chinese document is the normative source for version and publication governance. This file is
its synchronized English translation.
Workflow implementation may change but cannot weaken this policy's gates or evidence boundaries.

<!-- section: release-units -->
## Independent states

Report these states separately: local changes, local commit, default-branch push, immutable tag,
GitHub Release, Community Plugins status, and vault deployment. Completing one neither authorizes
nor proves the next.

<!-- section: versioning -->
## Version and metadata

Stable versions use `x.y.z` without a `v` prefix. `package.json`, `package-lock.json`,
`manifest.json`, and `versions.json` must agree. Never move or recreate a published tag; correct a
release problem with a new version.

<!-- section: preflight -->
## Release preflight

1. Define version scope, user-visible changes, breaking changes, and known limitations.
2. Update synchronized stable documents and changelog; pass bilingual and format checks.
3. Run `npm ci`, `npm run check`, and `npm run release:check` under pinned Node.js/npm.
4. Use final candidate assets in an isolated Vault to accept every claimed platform, and record the
   environment and result.
5. Record candidate commit and SHA-256 for all three runtime assets.
6. Commit intended source, confirm no modified or untracked files, and create one deterministic
   core handoff. Record the separate candidate envelope and passing acceptance closure.
7. After explicit authorization, create the exact numeric tag at that accepted commit. Tag creation
   and push do not trigger publication.

Automated gates prove source and candidate contracts only, not real Obsidian or every platform.

<!-- section: artifacts -->
## Release assets

The public Release contains only `main.js`, `manifest.json`, `styles.css`, and deterministic
`number-suite-x.y.z.zip`. The ZIP contains the same three assets under `number-suite/`.
Workflow handoff additionally contains `candidate.json` and `SHA256SUMS`; neither is a public
release asset.

<!-- section: publication -->
## Automated publication

The manual workflow defaults to read-only `verify`; no tag-push event publishes. The workspace
dispatches `publish` only with the exact candidate commit and candidate/envelope/closure/
authorization digests, the original portable closure and authorization bytes, and the exact core
authorization phrase. The verification job proves the tag and default-branch identity, runs the
pinned gate, reproduces `candidate.json`, and uploads one fixed artifact.

The write-enabled job downloads only that artifact, strictly decodes and validates both evidence
documents, and runs the core publication boundary. Before any remote write, a read-only GitHub
preflight permits staging, attestation, and creation only when the Release is missing. An exact
existing Release whose bytes and provenance pass every check is a zero-write safe rerun; any
conflict fails before those writes. `publish-github` repeats the boundary and existing-state
check. A separate post-verification job checks hosted bytes, metadata, tag identity, and
provenance. The workflow never overwrites, edits, or appends same-tag assets.

A failed workflow is not a successful Release. Report publication only after the remote Release
exists and final verification completes.

<!-- section: deployment -->
## Vault deployment

Vault deployment is not part of GitHub publication. Only explicit authorization for an exact target
vault permits replacing its three runtime assets. Record or back up old assets first, preserve
`data.json`, and verify every deployed hash. Never use an ordinary or production vault for first
candidate acceptance.

<!-- section: rollback -->
## Failure and rollback

Before publication, fix source or candidate and rerun gates. After tag publication, never move it;
publish a new version. Vault rollback uses recorded prior runtime assets without resetting user
settings. If remote, marketplace, or deployment state cannot be verified live, report it as
unverified instead of inferring from old records.

<!-- section: evidence-reporting -->
## Delivery reporting

Report version, commit, push/tag/Release state, asset hashes, automated gate, real host matrix,
device type, marketplace state, Vault target, and known limitations. Keep run-specific evidence
outside the stable documentation and do not infer one evidence layer from another.
