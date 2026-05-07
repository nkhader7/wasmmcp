---
module: ripgrep@14
sha256: 2726000000000000000000000000000000000000000000000000000000000a14
when: audit
args:
  maxMatches: 1000
caps:
  - fs:read
export: grep
---

# Grep Repo

Run a local repository grep through the IDE plugin.
