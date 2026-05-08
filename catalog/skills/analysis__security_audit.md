---
name: analysis__security_audit
category: analysis
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
description: Runs a broad security audit across the workspace using semgrep p/security-audit rules. Covers injection, authentication, cryptography, and OWASP Top-10 patterns. Returns findings with rule ID, severity, file, line, and fix guidance.
when: audit, open-pr, scheduled-scan
args:
  path: /workspace
  language: auto
  rules: p/security-audit
  severity: medium+
caps:
  - fs:read
export: scan
---

# Security Audit

Runs `semgrep@1.45` with the `p/security-audit` community rule pack. Language is auto-detected per file. Covers a wide surface: SQL injection, XSS, SSRF, insecure deserialization, weak crypto, and more.

Invoke for general security review, pre-PR checks, or scheduled audits.
