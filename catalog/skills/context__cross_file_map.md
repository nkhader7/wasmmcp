---
name: context__cross_file_map
category: context
module: tree-sitter@0.22
sha256: 5c2d000000000000000000000000000000000000000000000000000000f347bb
description: Builds a cross-file security context map — traces data flows across module boundaries, identifies entry points, and surfaces trust-boundary crossings. Used to pre-load context before a multi-file security review.
when: audit, open-pr, pre-review
args:
  path: /workspace
  language: auto
  output: cross-file-map
  focus: security-boundaries
caps:
  - fs:read
export: parse_ast
---

# Cross-File Security Context Map

Runs `tree-sitter@0.22` with cross-file analysis mode to identify: entry points that accept external input, trust-boundary crossings (e.g. user-controlled data flowing to privileged APIs), and module import chains relevant to a security review.

Use before any multi-file vulnerability analysis to avoid chasing false paths.
