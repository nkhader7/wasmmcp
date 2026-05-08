---
name: analysis__dead_code
category: analysis
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
description: Detects unreachable functions, unused exports, and dead branches using semgrep p/dead-code rules. Dead code is a security concern — it increases attack surface and often contains unvalidated legacy logic.
when: open-pr, audit
args:
  path: /workspace
  language: auto
  rules: p/dead-code
  severity: warning+
caps:
  - fs:read
export: scan
---

# Dead Code Finder

Runs `semgrep@1.45` with `p/dead-code` rules to surface unused functions, variables, imports, and conditional branches that never execute.

Use before a PR merge to reduce attack surface. Report findings with security context (e.g. dead auth helper = shadow logic risk).
