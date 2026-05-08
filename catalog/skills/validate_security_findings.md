---
module: tree-sitter@0.22
sha256: 5c2d000000000000000000000000000000000000000000000000000000f347bb
when: post-scan, open-pr, audit
args:
  language: auto
  output: evidence-map
  focus: adversarial-finding-validation
caps:
  - fs:read
export: parse_ast
---

# Validate Security Findings

Run the local `tree-sitter@0.22` module to gather local evidence for an adversarial validation pass: reachable paths, sanitizers, guards, callers, and nearby tests.
