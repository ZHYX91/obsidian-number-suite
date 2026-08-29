---
doc_id: testing-strategy
language: en
source_language: zh-CN
translation_of: testing-strategy.zh-CN.md
translation_status: synced
status: stable
last_synced: 2026-08-29
---

# Number Suite — Testing strategy

[中文规范源](testing-strategy.zh-CN.md)

<!-- section: authority -->
## Document authority

The Chinese document is the normative source for verification layers, gates, and evidence claims.
This file is its synchronized English translation. `ACCEPTANCE.md` is an executable checklist and
cannot weaken this strategy.

<!-- section: evidence-levels -->
## Evidence levels

1. **Source checks**: format, bilingual structure, lint, types, pure-logic and adapter tests.
2. **Candidate checks**: production bundle, manifest/version alignment, externals, offline runtime,
   and exact asset layout.
3. **Host acceptance**: real interaction in a named Obsidian version, OS, theme, and isolated vault.
4. **Device acceptance**: emulator and physical-device records remain separate.
5. **Public release**: remote tag, Release assets, byte comparison, and provenance; local builds do
   not prove this level.

Reports identify their evidence level and cannot infer a higher-level pass from a lower level.

<!-- section: automated-tests -->
## Automated tests

Core tests cover scanning, template compilation, formats, prefix recognition, exclusions, counters,
settings sanitization, immutable change plans, caption parsing, independent caption counters,
footnote/endnote syntax, independent note counters, repeated references, and definition-container
protection. Application tests cover virtual/conceal plans, fail-closed same-file reference and note
resolution, independent caption alignment, selection-based note-source reveal, Properties parsing,
note overrides, and conditional replacement. Adapter tests cover
recovery data, Reading View DOM-count validation, semantic-marker cleanup, and settings contracts.
The pure sidebar outline projection covers H1-H9 hierarchy, captions, display labels, protected
regions, and block-ID removal; targeted current-note tests cover sidebar focus and duplicate-view
failure.
Broader recognition requires false-positive fixtures first.

Coverage thresholds are regression floors, not quality targets or host acceptance. New critical
branches need behavioral assertions even when aggregate coverage stays above threshold.

<!-- section: canonical-gate -->
## Canonical gate

Under repository-pinned Node.js `24.19.0` and npm `11.17.0`, run:

```bash
npm ci
npm run check
```

The gate verifies runtime contract, real formatting, bilingual README structure, five stable
document pairs, lint, strict TypeScript, thresholded coverage, production bundle, and release-asset
contract. `release:check` adds version, tag, and clean-worktree checks.

<!-- section: host-acceptance -->
## Host acceptance

First runs use an isolated acceptance vault. At minimum, verify the ribbon-opened sidebar, both
internal tabs, H1-H9-and-caption outline navigation, current-note controls, independent
display/concealment, Live Preview, Reading View, previewed writes and undo, source accessibility,
plugin-disable cleanup, same-length edits, Properties persistence, and link-risk messaging. Batch
work also verifies stale previews, concurrent conflicts, mid-run failure, recovery, and exclusions.

The 0.7 line additionally verifies all four caption keywords with and without IDs, independent
per-file counters, explicit heading/block references and aliases, ordinary-link non-interference,
fail-closed missing/duplicate targets, independent alignment toggles, embedded-file boundaries, and
Markdown byte identity.

Footnote/endnote acceptance additionally covers default, explicit, and endnote syntax,
independent per-kind counters, repeated-reference reuse, fail-closed missing/duplicate/canonical
conflicts, two-space continuation protection, unchanged render-count mismatches, and Markdown byte
identity. Live Preview checks cover `1` versus `E1`, original-marker mode, click/cursor reveal, and
Reading View navigation preservation.

IME, mobile, pop-out windows, third-party themes, and long-document latency require real host
environments; automated DOM tests cannot replace them. Detailed steps remain in the
[runtime checklist](ACCEPTANCE.md).

An isolated Android 15 / API 35 emulator is the baseline device gate for every mobile candidate.
Install and hash-check the final candidate, then cover sidebar open/close, both tabs, H1-H9 and
caption outline navigation, 44-pixel touch targets, current-note controls, Live Preview, Reading
View, Chinese IME, the write/cleanup round trip, all seven settings tabs, background/foreground,
and disable cleanup. Physical Android is separate enhanced evidence, not Number Suite's baseline
mobile gate and cannot be promoted into a plugin-specific release prerequisite. Report its absence
as unverified and never infer physical-device success from emulator evidence. iOS is outside the
current acceptance matrix and cannot be inferred from Android results.

<!-- section: records -->
## Acceptance records

Each record identifies candidate commit, asset SHA-256, plugin/Obsidian versions, OS or device,
vault type, theme, automated gate, actual passed cases, known limitations, date, and executor.
Records are append-only historical facts. Later code or documentation cannot reinterpret an old
candidate as acceptance of a new one.

<!-- section: release-decision -->
## Release decision

Claim only the scope supported by the target version's canonical gate, candidate contract, and
required host matrix. If macOS, Linux, or physical-mobile records are missing, state that limitation
instead of saying “cross-platform verified.” An Android support claim requires at least current-
candidate API 35 emulator evidence; physical Android remains separately reported. See the
[release policy](release.en.md) for publication and remote-asset verification.
