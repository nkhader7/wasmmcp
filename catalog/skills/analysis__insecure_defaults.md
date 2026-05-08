---
name: analysis__insecure_defaults
category: analysis
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
description: Flags insecure default configurations and unsafe API usage patterns — debug mode in production, disabled TLS verification, overly permissive CORS, missing CSP headers, and weak cipher suites.
when: audit, open-pr
args:
  path: /workspace
  language: auto
  rules: p/insecure-defaults
  severity: medium+
caps:
  - fs:read
export: scan
---

# Insecure Defaults Scanner

Runs `semgrep@1.45` with `p/insecure-defaults` rules to catch: `DEBUG=True` in Django/Flask, `verify=False` in requests/urllib, `CORS(app, origins="*")`, missing `Secure` cookie flags, and default weak configurations.

Use when onboarding a new codebase or reviewing infrastructure/configuration code.
