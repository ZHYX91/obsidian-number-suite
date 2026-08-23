# Contributing

## Development setup

Use Node 24.19.0 and npm 11.17.0.

```bash
npm ci
npm run check
```

Keep the pure core independent from Obsidian and browser globals. All file mutations must be generated as an immutable previewable plan before an Editor or Vault adapter applies them.

## Pull requests

- Explain the user-visible behavior and safety boundary.
- Add tests for every parser or numbering rule.
- Include false-positive tests before broadening cleanup recognition.
- Distinguish automated verification from real Obsidian runtime acceptance.
- Do not add networking, telemetry, or remote assets without an explicit design and privacy review.
- Do not claim mobile support without device evidence.

Use Conventional Commit subjects such as `feat: add ...`, `fix: prevent ...`, or `docs: clarify ...`.
