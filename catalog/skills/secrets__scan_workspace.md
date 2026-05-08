---
name: secrets__scan_workspace
category: secrets
module: gitleaks@8.30
sha256: 7e4a000000000000000000000000000000000000000000000000000000d512c3
description: Scans the entire workspace for hardcoded secrets, API keys, and credentials using gitleaks v8.30 rules. Returns structured findings with severity, file, line, and redacted snippet. Run before any push or audit. Workspace bytes never leave the IDE.
when: pre-commit, audit, push, user-request
args:
  path: /workspace
  redact: true
  severity: low+
caps:
  - fs:read
export: scan_repo
---

# Scan Workspace for Secrets

Runs `gitleaks@8.30` with 300+ detection rules against the full workspace. Findings include severity tier, exact file and line, redacted snippet, and the committing SHA when the secret is in git history.

Invoke this tool when the user mentions: "check for secrets", "scan my repo", "look for API keys", "leaked credentials", "pre-push check".
