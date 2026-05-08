---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: audit, open-pr
args:
  language: c,cpp
  rules: p/security-audit
  severity: high+
  focus: c-cpp-memory-lifetime-bounds-security-review
caps:
  - fs:read
export: scan
---

# ToB C CPP Security Review

Run a C/C++ focused security scan for risky memory handling, lifetime mistakes, bounds issues, integer hazards, and dangerous API use.
