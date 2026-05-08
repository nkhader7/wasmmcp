---
module: gitleaks@8.30
sha256: 7e4a000000000000000000000000000000000000000000000000000000d512c3
when: pre-commit
args:
  redact: true
  severity: low+
caps:
  - fs:read
export: scan_diff
---

# Scan Diff
Run the local `gitleaks@8.30` module against staged changes only (`git diff --cached`) for fast pre-commit secret detection. Redacts secrets in output by default. Exits non-zero if any finding meets the severity threshold.
