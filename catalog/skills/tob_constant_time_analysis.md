---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: audit, crypto-review
args:
  language: c,cpp,rust,go
  rules: p/security-audit
  severity: high+
  focus: constant-time-timing-side-channel
caps:
  - fs:read
export: scan
---

# ToB Constant Time Analysis

Scan cryptographic comparison and branching code for obvious timing-side-channel risks and places that need deeper compiler or microarchitectural review.
