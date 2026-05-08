---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: audit, open-pr, pre-deploy
args:
  language: auto
  rules: p/security-audit
  severity: high+
  focus: fail-open-defaults-hardcoded-credentials-permissive-config
caps:
  - fs:read
export: scan
---

# ToB Insecure Defaults

Scan for production-reachable fail-open defaults, hardcoded credentials, disabled security checks, permissive CORS, debug exposure, and weak crypto defaults.
