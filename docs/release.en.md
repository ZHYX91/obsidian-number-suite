---
doc_id: release
language: en
source_language: zh-CN
translation_of: release.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-08-13
---

# Release policy

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
3. Run `npm ci` and `npm run release:check` under pinned Node.js/npm.
4. Use final candidate assets for dated isolated-vault acceptance covering claimed platforms.
5. Record candidate commit and SHA-256 for all three runtime assets.
6. Commit intended source, confirm no modified or untracked files, then manually run the read-only
   Release preflight from the current remote default-branch HEAD with the proposed version. The
   preflight requires the same-version remote tag and Release to be absent.
7. Create and push the tag only after preflight passes.

Automated gates prove source and candidate contracts only, not real Obsidian or every platform.

<!-- section: artifacts -->
## Release assets

The public Release contains only `main.js`, `manifest.json`, `styles.css`, and deterministic
`number-suite-x.y.z.zip`. The ZIP contains the same three assets under `number-suite/`.
Workflow handoff may additionally contain `SHA256SUMS`, but it is not a public release asset.

<!-- section: publication -->
## Automated publication

After a numeric tag push, GitHub Actions verifies tag, default-branch ancestry, pinned toolchain,
dependencies, and canonical gates in a read-only phase. It builds deterministic assets and uploads
one identified handoff artifact. A separate write-enabled phase downloads and verifies that exact
artifact, issues provenance, creates the Release, then downloads every public asset for byte and
attestation verification.

A failed tag workflow is safely rerunnable. An existing same-tag Release is accepted as a successful
no-op only when it is stable, immutable, contains exactly the four public assets, matches the current
candidate byte for byte, and all four provenance records bind the same tag and commit. Any
difference fails; the workflow never overwrites, edits, or appends same-tag assets.

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
device type, marketplace state, vault target, and known limitations. Preserve historical acceptance
records with their original wording and date; stable-document updates cannot expand their scope.
