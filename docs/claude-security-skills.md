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

The `tob_*` skills adapt public Trail of Bits security skill categories into this repository's MCP dispatcher format. They are not copied skill bodies; they are local recipes that map audit intents onto the existing signed module registry.

| Skill | Module | Purpose |
|---|---|---|
| `tob_audit_context` | `tree-sitter@0.22` | Build architectural context before vulnerability hunting. |
| `tob_fp_check` | `tree-sitter@0.22` | Gather evidence for true-positive and false-positive review. |
| `tob_insecure_defaults` | `semgrep@1.45` | Scan fail-open defaults, hardcoded credentials, and permissive config. |
| `tob_sharp_edges` | `semgrep@1.45` | Scan misuse-prone APIs and dangerous configuration surfaces. |
| `tob_variant_analysis` | `semgrep@1.45` | Search for variants of a known root-cause pattern. |
| `tob_supply_chain_manifest_audit` | `ripgrep@14` | Collect local dependency manifests and lockfiles for supply-chain review. |
| `tob_zeroize_source_audit` | `semgrep@1.45` | Scan source-level secret cleanup and zeroization patterns. |
| `tob_c_cpp_security_review` | `semgrep@1.45` | Run C/C++ memory and lifetime security checks. |
| `tob_differential_review` | `semgrep@1.45` | Review security-sensitive changed-code context. |
| `tob_agentic_actions_audit` | `semgrep@1.45` | Scan automation workflows for agent and token risks. |
| `tob_constant_time_analysis` | `semgrep@1.45` | Scan for obvious timing-side-channel risks. |
| `tob_static_analysis_semgrep` | `semgrep@1.45` | General static security pass. |

Trail of Bits skills that require unsupported modules or external services, such as YARA execution, CodeQL databases, Android APK parsing, GitHub API enrichment, or blockchain-specific tooling, are intentionally not represented as runnable local module invocations here.
