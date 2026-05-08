---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: open-pr, audit
args:
  language: yaml
  rules: p/security-audit
  severity: medium+
  focus: github-actions-agentic-workflow-risk
caps:
  - fs:read
export: scan
---

# ToB Agentic Actions Audit

Scan GitHub Actions and automation workflows for risky agent permissions, untrusted inputs, token exposure, unsafe checkout patterns, and prompt or command injection surfaces.
