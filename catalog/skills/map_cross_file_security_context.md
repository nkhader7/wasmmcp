---
module: tree-sitter@0.22
sha256: 5c2d000000000000000000000000000000000000000000000000000000f347bb
when: post-scan, open-pr, audit
args:
  language: auto
  output: call-graph
  focus: cross-file-security-context
caps:
  - fs:read
export: parse_ast
---

# Map Cross File Security Context

Run the local `tree-sitter@0.22` module to extract symbols, call graph edges, route handlers, and source/sink context that helps the agent reason across files after scanner findings.
