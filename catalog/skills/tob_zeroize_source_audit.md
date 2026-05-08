---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: audit, crypto-review
args:
  language: c,cpp,rust
  rules: p/security-audit
  severity: medium+
  focus: sensitive-data-zeroization-source-level
caps:
  - fs:read
export: scan
---

# ToB Zeroize Source Audit

Scan C, C++, and Rust source for secret-handling code that lacks obvious zeroization, copies sensitive buffers, or uses cleanup paths that need deeper compiler evidence.
