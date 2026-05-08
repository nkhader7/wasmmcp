---
name: analysis__memory_safety
category: analysis
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
description: Detects memory corruption vulnerabilities (buffer overflows, use-after-free, integer overflows, unsafe pointer arithmetic) in C, C++, and Rust code using semgrep p/memory-safety rules.
when: audit, open-pr
args:
  path: /workspace
  language: auto
  rules: p/memory-safety
  severity: medium+
caps:
  - fs:read
export: scan
---

# Memory Safety Scanner

Runs `semgrep@1.45` with `p/memory-safety` rules targeting: `strcpy`/`sprintf` without bounds, heap use-after-free, integer truncation before allocation, and `unsafe` blocks in Rust without justification.

Use when reviewing C, C++, or Rust code that handles raw memory or external data.
