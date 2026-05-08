---
module: semgrep@1.45
sha256: 3a7b000000000000000000000000000000000000000000000000000000c891af
when: audit, api-review, open-pr
args:
  language: auto
  rules: p/security-audit
  severity: medium+
  focus: dangerous-apis-footguns-misuse-resistant-design
caps:
  - fs:read
export: scan
---

# ToB Sharp Edges

Scan for APIs and configuration surfaces where easy or default usage can create security mistakes: ambiguous zero values, algorithm selection, silent failures, and stringly typed security decisions.
