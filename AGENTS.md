# Repository guidance

- Begin audits read-only and preserve unrelated user changes.
- Treat `src/core` as host-independent pure logic; it must not import Obsidian.
- All file writes require an immutable plan, preview, stale-content check, and bounded target.
- Never broaden cleanup recognition without adding false-positive fixtures first.
- Virtual and conceal display paths must never call Editor or Vault write APIs.
- A green `npm run check` is not real Obsidian runtime acceptance; use `docs/ACCEPTANCE.md`.
- Use Conventional Commit subjects and normal Git identity; do not add agent attribution.

## Deployment and host acceptance

Deploy to a production Vault only when the user explicitly names and authorizes the exact target. Before copying, resolve the target plugin directory, record or back up the currently installed runtime assets, and hash `data.json` when present. Replace only the verified production assets declared by the release contract, preserve `data.json` unless the user explicitly authorizes a reset, and verify the installed hashes after copying.

Acceptance fixtures, cleanup scripts, and destructive test operations may target only explicitly identified temporary Vaults; never point them at an ordinary or production Vault. Source checks, packaged-candidate checks, deployed-host behavior, emulator evidence, and physical-device evidence remain separate claims.
