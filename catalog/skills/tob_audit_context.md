---
module: tree-sitter@0.22
sha256: 5c2d000000000000000000000000000000000000000000000000000000f347bb
when: audit, open-pr, pre-hunt
args:
  language: auto
  output: audit-context
  focus: architecture-entrypoints-state-invariants
caps:
  - fs:read
export: parse_ast
---

# ToB Audit Context

Build local architectural context before vulnerability hunting: entrypoints, trust boundaries, important state, cross-file call relationships, and invariants.
