---
name: secrets__scan_staged
category: secrets
module: gitleaks@8.30
sha256: 7e4a000000000000000000000000000000000000000000000000000000d512c3
description: Scans only git-staged changes for secrets using gitleaks. Fast pre-commit gate — blocks the commit if any finding meets the severity threshold. Complements secrets__scan_workspace for full history coverage.
when: pre-commit
args:
  path: /workspace
  redact: true
  severity: low+
caps:
  - fs:read
export: scan_diff
---

# Scan Staged Changes for Secrets

Runs `gitleaks@8.30 detect --staged` on the bytes about to be committed. Returns an empty findings list (commit allowed) or findings that must be resolved before the commit proceeds.

Invoke automatically on `on:pre-commit` rule triggers or when the user says "check what I'm committing".
