---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: open-pr, audit, scheduled-scan
args:
  language: auto
  rules: p/owasp-top-ten
  severity: high+
  focus: injection
caps:
  - fs:read
export: scan
---

# Scan Injection Flaws

Run the local `semgrep@1.45` module for injection-oriented vulnerability patterns, including unsafe query construction, command execution, templating, and deserialization sinks.
