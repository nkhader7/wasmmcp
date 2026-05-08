---
module: tree-sitter@0.22
sha256: 5c2d000000000000000000000000000000000000000000000000000000f347bb
when: post-scan, open-pr, audit
args:
  language: auto
  output: verification-evidence
  focus: true-positive-false-positive-gate
caps:
  - fs:read
export: parse_ast
---

# ToB FP Check

Gather local evidence needed to challenge a suspected finding: caller constraints, source-to-sink reachability, validation paths, threat model context, and confidence gates.
