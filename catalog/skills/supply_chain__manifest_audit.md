---
name: supply_chain__manifest_audit
category: supply_chain
module: ripgrep@14
sha256: 2726000000000000000000000000000000000000000000000000000000000a14
description: Audits package manifests (package.json, Cargo.toml, go.mod, requirements.txt, pyproject.toml) for known-vulnerable version ranges, GPL license contamination, and typosquatting patterns. Runs offline against an embedded advisory database.
when: audit, open-pr
args:
  path: /workspace
  query: "(package\\.json|Cargo\\.toml|go\\.mod|requirements\\.txt|pyproject\\.toml)"
  maxMatches: 5000
caps:
  - fs:read
export: grep
---

# Supply Chain Manifest Audit

Runs `ripgrep@14` to locate all dependency manifests in the workspace, then applies pattern matching against known-vulnerable version ranges, copyleft license identifiers, and typosquatting name patterns.

Invoke before any release cut, or when a new dependency is added in a PR.
