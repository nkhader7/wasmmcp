---
name: analysis__auth_bypass
category: analysis
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
description: Detects authentication and authorization bypass patterns using semgrep p/auth rules. Flags missing access controls, insecure JWT handling, hardcoded tokens, and privilege escalation paths.
when: audit, open-pr, branch-push
args:
  path: /workspace
  language: auto
  rules: p/auth
  severity: high+
caps:
  - fs:read
export: scan
---

# Authentication Bypass Scanner

Runs `semgrep@1.45` with `p/auth` rules to find: missing `@login_required` / `requireAuth()` guards, JWT algorithm confusion, hardcoded admin credentials, and improper session management.

Use before any PR that touches authentication, session handling, or access control logic.
