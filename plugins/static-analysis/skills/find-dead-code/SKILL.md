---
name: find-dead-code
description: "Detects unreachable functions, unused exports, and dead branches using semgrep@1.45 in WASM. Invoke on open-pr or audit events to surface attack surface reduction opportunities."
allowed-tools: [mcp__wasmmcp__find_dead_code]
---

# Find Dead Code

Runs `semgrep@1.45` with the `p/dead-code` rule pack through the IDE plugin's sandboxed WASM runtime. Identifies functions, variables, classes, and exports that are defined but never referenced. Dead code is a security concern because it often contains unvalidated inputs, deprecated auth paths, and shadow logic that survives refactors.

## When to Use

- When a pull request adds or removes significant surface area (`on:open-pr` rule trigger)
- During a full audit sweep (`on:audit`) to establish baseline dead-code metrics
- When a user says "find unused code", "check for dead code", "what's not being called", "find unreachable functions"
- Before a security review — dead code is attack surface that reviewers spend time on unnecessarily
- When refactoring: to confirm that removed call sites actually leave a function unreferenced

## When NOT to Use

- On generated code (`pb.go`, `*.pb.ts`, ORM models) — generated files have intrinsic reference patterns that semgrep's inter-file analysis cannot follow accurately
- On framework entry points (Express route handlers, Django views, FastAPI decorators) — these are called by the framework, not by code semgrep can trace
- As a complete dead-code elimination pass — semgrep performs pattern-matching, not full data-flow analysis; confirm with the build toolchain (`webpack`, `rollup`, Go's linker) before deleting
- When the user is asking about *performance* optimisation, not *security* surface reduction

## Rationalizations to Reject

- **"The function might be called via reflection or dynamic dispatch."** If it is, the calling site exists and semgrep will find it. If it is not found, the function is dead by static analysis — document the dynamic call explicitly.
- **"It was added for future use."** Uncommitted future functionality increases attack surface today. Remove it and re-add it when it is needed.
- **"Deleting it would break the build."** If deleting an unreferenced function breaks the build, there is a reference semgrep did not find — investigate that reference rather than keeping the dead code.

## Execution

Module invocation: `semgrep@1.45` with `--config p/dead-code --json`.  
Capability set: `["fs:read"]`. Language is auto-detected per file. Results are structured findings with rule ID, file, line, and severity.

## Findings Shape

| Field | Type | Description |
|---|---|---|
| `rule` | string | Semgrep rule ID (e.g., `python.dead-code.unused-function`) |
| `severity` | `warning \| info` | Impact tier (dead code is never critical) |
| `path` | string | Guest path |
| `line` | number | Definition site line number |
| `redactedSnippet` | string | The dead symbol's signature |

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|---|---|---|
| Treating all semgrep findings as confirmed dead | Semgrep has false positives on dynamic languages | Flag for developer review; do not auto-delete |
| Reporting dead-code findings without context | Developer cannot triage without knowing call graph | Include the function signature and file context |
| Running only on changed files in a PR | Dead code is often introduced far from where it is used | Scan the full workspace; filter results by PR-touched paths |

## Examples

### Example 1: Unused auth helper

```
User: Can you check for dead code before I open this PR?

Agent: Running semgrep across the workspace for unused symbols.

⚙ semgrep.find_dead_code ({ language: "auto", rules: "p/dead-code" })  ● done · 1.1 s

Found 3 unreachable symbols:

| ○ WARNING | unused-function | src/auth/legacy.ts:42 | function validateLegacyToken() |
| ○ WARNING | unused-export   | src/utils/crypto.ts:7  | export function md5Hash()       |
| ○ INFO    | dead-branch     | src/api/user.ts:91     | if (FEATURE_FLAG_V1) { … }      |

Recommendation: `validateLegacyToken` and `md5Hash` appear to be legacy auth helpers —
removing them reduces the attack surface for any future injection or downgrade attack.
The dead branch at user.ts:91 suggests FEATURE_FLAG_V1 was never flipped; confirm and remove.
```

## Quality Checklist

- [ ] Each finding includes the symbol name and definition site
- [ ] Findings distinguish between unused functions, unused exports, and dead branches
- [ ] Framework-generated or reflection-called code is excluded or flagged as needing manual review
- [ ] Security implications of each dead symbol are explained (legacy auth, deprecated crypto, etc.)
- [ ] File count and duration are surfaced in the summary
