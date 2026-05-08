---
name: analysis__constant_time
category: analysis
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
description: Detects compiler-induced timing side-channels in cryptographic code — variable-time comparisons, secret-dependent branches, and floating-point operations where constant-time primitives are required.
when: audit
args:
  path: /workspace
  language: auto
  rules: p/time
  severity: medium+
caps:
  - fs:read
export: scan
---

# Constant-Time Analysis

Runs `semgrep@1.45` with `p/time` rules to flag: `==` comparisons of secrets instead of `hmac.compare_digest`, secret-dependent `if` branches, division or floating-point ops in crypto paths, and early-exit patterns that leak secret length.

Use when reviewing any code that handles MACs, passwords, session tokens, or cryptographic keys.
