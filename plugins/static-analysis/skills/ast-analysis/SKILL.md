---
name: ast-analysis
description: "Extracts symbol tables, call graphs, and structural metadata from source files using tree-sitter@0.22 in WASM. Use to build context before a security review or to answer structural questions about a codebase."
allowed-tools: [mcp__wasmmcp__parse_ast]
---

# Parse AST and Extract Structural Metadata

Runs `tree-sitter@0.22` against the workspace to produce a language-agnostic symbol index: function definitions, class hierarchies, exported symbols, import graphs, and call sites. Output is consumed by downstream security review skills and by the LLM to answer structural questions without reading every file.

## When to Use

- As a preparatory step before a security review — call this first to build the context map
- When a user asks "what functions handle authentication?", "where is X called?", "what does this module export?"
- During an audit sweep to generate the input for variant analysis or data-flow tracing
- When the codebase is large and reading every file would exceed context — use this to build a targeted read list
- As part of `on:audit` to capture a structural baseline

## When NOT to Use

- When the user wants a security *finding*, not a structural *map* — use `scan-secrets` or `find-dead-code` instead
- On minified or transpiled output files — tree-sitter parses syntax, not semantics; minified code produces unreadable symbol names
- As a substitute for running the actual compiler or type checker — tree-sitter has no type inference

## Execution

Module: `tree-sitter@0.22` with `--output symbols`.  
The module walks `/workspace`, detects language per file extension, parses each file, and emits a JSON symbol table.  
Capability set: `["fs:read"]`. No network. No writes.

## Output Shape

```json
{
  "symbols": [
    {
      "kind":       "function",
      "name":       "validateToken",
      "file":       "/workspace/src/auth/token.ts",
      "line":       14,
      "exported":   true,
      "calledBy":   ["/workspace/src/middleware/auth.ts:32"],
      "calls":      ["verifyJwt", "lookupUser"]
    }
  ],
  "imports": [
    { "from": "/workspace/src/auth/token.ts", "module": "jsonwebtoken", "symbols": ["verify"] }
  ]
}
```

## Quality Checklist

- [ ] File count and language breakdown are reported
- [ ] Symbol count per language is surfaced
- [ ] Exported-vs-internal ratio is noted (high export ratio = large attack surface)
- [ ] Any files that failed to parse (syntax errors) are listed separately
