---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: open-pr, branch-push
args:
  language: auto
  rules: p/security-audit
  severity: medium+
  focus: security-differential-review-changed-code
caps:
  - fs:read
export: scan
---

# ToB Differential Review

Scan changed-code context for security-sensitive deltas, then return module-local findings that the agent can validate against nearby callers and history.
