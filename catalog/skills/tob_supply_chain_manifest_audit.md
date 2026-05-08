---
module: ripgrep@14
sha256: 2726000000000000000000000000000000000000000000000000000000000a14
when: audit, pre-engagement, scheduled-scan
args:
  query: dependencies
  maxMatches: 2000
  focus: dependency-manifests-lockfiles-security-policy
caps:
  - fs:read
export: grep
---

# ToB Supply Chain Manifest Audit

Collect dependency manifests, lockfiles, package metadata, and security policy references for local supply-chain risk review without contacting external registries.
