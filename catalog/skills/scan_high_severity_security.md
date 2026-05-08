---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: open-pr, audit, scheduled-scan
args:
  language: auto
  rules: p/security-audit
  severity: high+
  focus: high-severity-vulnerabilities
caps:
  - fs:read
export: scan
---

# Scan High Severity Security

Run the local `semgrep@1.45` module for high-severity security findings before review, audit, or scheduled security coverage.
