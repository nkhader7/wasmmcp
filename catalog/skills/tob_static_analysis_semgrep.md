---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: audit, open-pr, scheduled-scan
args:
  language: auto
  rules: p/security-audit
  severity: medium+
  focus: general-static-analysis-security
caps:
  - fs:read
export: scan
---

# ToB Static Analysis Semgrep

Run a general local Semgrep security pass and return structured findings for later validation, deduplication, and patch review.
