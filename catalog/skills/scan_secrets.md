---
module: gitleaks@8.21
sha256: 9f1e00000000000000000000000000000000000000000000000000000000b203
when: pre-commit, audit
args:
  redact: true
  severity: low+
caps:
  - fs:read
export: scan_repo
---

# Scan Secrets

Run the local `gitleaks@8.21` module against the workspace through a read-only filesystem capability.
