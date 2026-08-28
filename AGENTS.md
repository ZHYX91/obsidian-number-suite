# Repository guidance

- Begin audits read-only and preserve unrelated user changes.
- Treat `src/core` as host-independent pure logic; it must not import Obsidian.
- All file writes require an immutable plan, preview, stale-content check, and bounded target.
- Never broaden cleanup recognition without adding false-positive fixtures first.
- Virtual and conceal display paths must never call Editor or Vault write APIs.
- A green `npm run check` is not real Obsidian runtime acceptance; use `docs/ACCEPTANCE.md`.
- Use Conventional Commit subjects and normal Git identity; do not add agent attribution.

## Settings surface policy

Declarative settings are intentionally disabled because Obsidian 1.13 bypasses `display()` for
non-empty definitions, which removes Number Suite's seven-tab settings layout and degrades the user
experience. Preserve the imperative `PluginSettingTab.display()` surface and keep
`getSettingDefinitions()` empty. Dormant declarative builders and tests may remain, but must not be
activated accidentally. Do not flag the `display()` deprecation, empty definitions, the disabled
feature switch, or missing settings search, and do not propose a declarative migration unless the
user explicitly asks to revisit this decision.

## Manual installation release policy

The versioned `number-suite-<version>.zip` is an intentional required public release asset for
users who install without the Obsidian Community marketplace. Community ignores it during plugin
ingestion, so the automated-review `extra unsupported files` recommendation is expected and must
not be treated as a defect or a reason to remove the archive. The deterministic ZIP contains one
`number-suite/` directory with `main.js`, `manifest.json`, and `styles.css`, byte-identical to the
three loose release assets. Release checks must preserve and verify all four public assets.

## Public documentation

`CHANGELOG.md` is the only public document that records release history. README and user help
describe the product as it works now: compatibility, installation, usage, settings, limitations,
privacy, and support. Do not add version banners, dated acceptance evidence, release-status
narratives, or superseded plans outside the changelog. Keep migration or deprecation guidance only
when users still need to act, and state the required action directly. Engineering documents describe
the current contract and repeatable process rather than past executions.

## Deployment and host acceptance

Deploy to a production Vault only when the user explicitly names and authorizes the exact target. Before copying, resolve the target plugin directory, record or back up the currently installed runtime assets, and hash `data.json` when present. Replace only the verified production assets declared by the release contract, preserve `data.json` unless the user explicitly authorizes a reset, and verify the installed hashes after copying.

Acceptance fixtures, cleanup scripts, and destructive test operations may target only explicitly identified temporary Vaults; never point them at an ordinary or production Vault. Source checks, packaged-candidate checks, deployed-host behavior, emulator evidence, and physical-device evidence remain separate claims.
