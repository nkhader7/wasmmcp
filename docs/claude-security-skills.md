# Claude Security Skill Pack

This catalog maps Claude Security-style workflows onto the local WASM MCP architecture.

Claude Security emphasizes scanning code, validating findings, proposing targeted fixes, fitting existing workflows, scheduled/scoped scans, and human review of patches. In this repository those behaviors are represented as dispatcher skills only. The MCP server returns module references and arguments; the IDE-local plugin still owns workspace access and WASM execution.

## Skills

| Skill | Module | Purpose |
|---|---|---|
| `scan_high_severity_security` | `semgrep@1.45` | Broad high-severity security scan for audits, PRs, and scheduled scans. |
| `scan_injection_flaws` | `semgrep@1.45` | Injection-oriented scan for unsafe sinks and input handling. |
| `scan_auth_bypass` | `semgrep@1.45` | Authentication and authorization bypass scan. |
| `scan_memory_corruption` | `semgrep@1.45` | Native-code memory-safety scan for audit and scheduled coverage. |
| `map_cross_file_security_context` | `tree-sitter@0.22` | Extract symbols and call graph context for cross-file reasoning. |
| `validate_security_findings` | `tree-sitter@0.22` | Gather evidence for an adversarial validation pass. |
| `collect_patch_review_context` | `tree-sitter@0.22` | Gather surrounding code and tests for targeted patch proposals. |

Existing skills such as `scan_secrets`, `scan_diff`, `grep_repo`, `find_dead_code`, and `parse_ast` remain available.

## Rules

| Event | Security behavior |
|---|---|
| `pre-commit` | Fast secret, diff, and injection scan. |
| `branch-push` | Secret plus high-severity and auth-bypass scan. |
| `open-pr` | PR security scan, validation context, and patch context. |
| `audit` | Full local security suite. |
| `scheduled-scan` | Recurring full security scan recipe. |

## Boundary

These skills do not add new capabilities. Every skill requests only `fs:read`, and every module is referenced by `name@version + sha256`.

## Trail of Bits-Inspired Pack

The `tob_*` skills adapt public Trail of Bits security skill categories into this repository's MCP dispatcher format. They are original local recipes that map audit intents onto the existing signed module registry. See [trailofbits-skill-map.md](./trailofbits-skill-map.md) for the full coverage map.
