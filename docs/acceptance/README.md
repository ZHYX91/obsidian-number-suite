# Acceptance records

This directory stores append-only evidence for host or device acceptance that was actually performed.

Do not create a record merely because automated CI passed. Copy `TEMPLATE.md` only after an acceptance run has real evidence. Name records as `<version>-<surface>-YYYY-MM-DD.md`, for example `0.5.2-windows-2026-10-03.md`.

A later release must never edit an older record to imply that the older candidate tested newer code. Corrections should be added as a clearly dated note or a new record.
