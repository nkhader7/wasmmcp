---
name: context__parse_ast
category: context
module: tree-sitter@0.22
sha256: 5c2d000000000000000000000000000000000000000000000000000000f347bb
description: Extracts symbol tables, function signatures, class hierarchies, and call-graph edges from source files using tree-sitter. Language is auto-detected. Use to build structural context before a security review without reading every file.
when: audit, pre-review, user-request
args:
  path: /workspace
  language: auto
  output: symbols
caps:
  - fs:read
export: parse_ast
---

# Parse AST and Extract Symbols

Runs `tree-sitter@0.22` to produce a structured symbol index: function definitions, exported symbols, import graphs, and call sites. Output is JSON with file, line, kind, name, and references for each symbol.

Use at the start of a security review to build a targeted read list, or when the user asks "what functions handle authentication?", "where is X called?".
