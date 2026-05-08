---
module: tree-sitter@0.22
sha256: 5c2d000000000000000000000000000000000000000000000000000000f347bb
when: audit
args:
  language: auto
  output: symbols
caps:
  - fs:read
export: parse_ast
---

# Parse AST
Run the local `tree-sitter@0.22` module to extract symbol tables, function signatures, and structural information from source files. Language is auto-detected. Output includes definitions, references, and call graph edges.
