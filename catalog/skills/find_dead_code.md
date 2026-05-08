---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: open-pr, audit
args:
  language: auto
  rules: p/dead-code
  severity: warning+
caps:
  - fs:read
export: find_dead_code
---

# Find Dead Code
Run the local `semgrep@1.45` module to detect unused functions, variables, and imports across the workspace. Safe to run on any language semgrep supports; language is auto-detected per file.
