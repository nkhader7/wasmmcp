---
module: tree-sitter@0.22
sha256: 5c2d000000000000000000000000000000000000000000000000000000f347bb
when: post-scan, open-pr, audit
args:
  language: auto
  output: patch-context
  focus: targeted-remediation
caps:
  - fs:read
export: parse_ast
---

# Collect Patch Review Context

Run the local `tree-sitter@0.22` module to collect style, neighboring APIs, tests, and affected symbols so the agent can propose a targeted patch for human review.
