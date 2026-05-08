---
name: context__grep
category: context
module: ripgrep@14
sha256: 2726000000000000000000000000000000000000000000000000000000000a14
description: Fast full-text and regex search across the workspace using ripgrep. Use to locate symbols, patterns, TODO markers, config keys, or any text before a deeper analysis. Returns file paths, line numbers, and matching lines.
when: user-request, audit, pre-review
args:
  path: /workspace
  query: ""
  maxMatches: 1000
  ignoreCase: false
caps:
  - fs:read
export: grep
---

# Grep Repository

Runs `ripgrep@14` across the workspace with the provided query. Supports literal strings and regular expressions. Results are grouped by file with 1-based line numbers.

Invoke when the user asks "where is X used", "find all references to Y", "search for pattern Z", or as a preparatory step before any targeted scan.
