---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: post-finding, audit
args:
  language: auto
  rules: p/security-audit
  severity: medium+
  focus: bug-variant-search-root-cause-pattern
caps:
  - fs:read
export: scan
---

# ToB Variant Analysis

Search the workspace for variants of a known issue by generalizing from root cause, not variable names, and returning candidate matches for triage.
