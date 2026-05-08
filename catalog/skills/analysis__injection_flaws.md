---
name: analysis__injection_flaws
category: analysis
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
description: Detects injection vulnerabilities (SQL, command, LDAP, XPath, template injection) using semgrep p/injection rules. High-signal, low-noise — focuses on taint flows from user-controlled input to dangerous sinks.
when: audit, open-pr
args:
  path: /workspace
  language: auto
  rules: p/injection
  severity: medium+
caps:
  - fs:read
export: scan
---

# Injection Flaw Scanner

Runs `semgrep@1.45` with `p/injection` rules targeting taint paths from user input to: SQL queries, shell commands, LDAP queries, XPath expressions, and template engines.

Use when reviewing code that handles untrusted input or constructs queries/commands dynamically.
