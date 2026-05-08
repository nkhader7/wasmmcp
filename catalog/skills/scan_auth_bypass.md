---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: open-pr, audit, scheduled-scan
args:
  language: auto
  rules: p/security-audit
  severity: high+
  focus: authentication-authorization
caps:
  - fs:read
export: scan
---

# Scan Auth Bypass

Run the local `semgrep@1.45` module for authentication and authorization bypass patterns, with findings intended for follow-up validation against call paths and route guards.
