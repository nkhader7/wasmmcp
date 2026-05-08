---
name: scan-secrets
description: "Scans a workspace for hardcoded secrets, API keys, and credentials using the local gitleaks WASM module. Invoke before any push, PR, or audit event. Workspace bytes never leave the IDE process."
allowed-tools: [mcp__wasmmcp__scan_secrets]
---

# Scan Workspace for Secrets

Runs `gitleaks@8.30` against the open workspace through a read-only, capability-confined WASM sandbox. Output is a list of structured findings with severity, location, and redacted snippet. The MCP server resolves the skill to a module reference and the IDE plugin executes it locally — no source code is sent to any remote service.

## When to Use

- Before pushing a branch or creating a pull request
- During a pre-commit check triggered by the `on:pre-commit` rule
- When a user says "check for secrets", "scan my repo", "look for API keys", "do a secret scan", or similar
- After adding a new file that handles credentials, environment variables, or service configuration
- As part of a full `on:audit` sweep alongside dead-code and dependency checks
- When onboarding a legacy codebase that may have historical credential exposure

## When NOT to Use

- On repositories where the workspace is mounted read-write from an untrusted remote (the `wasi:filesystem` preopen is always read-only, but the findings contain paths — verify the trust boundary)
- As a replacement for proper secrets management (Vault, AWS Secrets Manager, etc.) — this finds leakage, it does not prevent it at the application level
- On generated build artifacts or binary blobs (`.wasm`, `.exe`, `.dll`) — the scanner skips binaries; findings in minified JS bundles indicate a source problem, not a build artifact problem
- When the user is asking about secrets *management architecture* rather than *detection* — redirect to a different skill

## Rationalizations to Reject

- **"It looks like a placeholder."** Gitleaks applies entropy gates and allowlists to filter examples, but the only safe placeholder is one in a file explicitly covered by a `gitleaks:allow` annotation. Report it; let the developer decide.
- **"It's in a test file."** Tests run in CI and often share credential stores. A leaked key in `test/fixtures/` is just as rotatable as one in `config/prod.env`.
- **"The repo is private."** Private repos get breached. Exposure risk is non-zero and rotation cost is fixed — always report.
- **"It's already in git history."** Report it in the finding's `commit` field so the developer knows whether BFG or `git filter-repo` is needed. Age does not reduce impact.
- **"The entropy is low so it's probably not real."** Entropy filtering is the scanner's job, not yours. Surface the finding; add context if you have it.

## Execution

The MCP client calls `tools/call { name: "scan_secrets", arguments: { path: "/workspace", redact: true } }`.  
The MCP server resolves this to:
```json
{
  "invokeLocal": {
    "module": "gitleaks@8.30",
    "sha256": "7e4a…d512c3",
    "args":   { "path": "/workspace", "redact": true, "severity": "low+" },
    "caps":   ["fs:read"]
  }
}
```
The IDE plugin instantiates `gitleaks.wasm` with a `wasi:filesystem` preopen of `/workspace` at fd=3, read-only. No sockets are linked. Stdout is captured; findings are streamed back as structured JSON.

## Findings Shape

Each finding returned by the module:

| Field | Type | Description |
|---|---|---|
| `rule` | string | Gitleaks rule ID (e.g., `aws-access-token`) |
| `severity` | `critical \| high \| medium \| low` | Impact tier |
| `path` | string | Guest path (`/workspace/src/config.js`) |
| `line` | number | 1-based line number |
| `redactedSnippet` | string | Line text with secret replaced by `****` |
| `commit` | string? | Git commit SHA if secret is in history |
| `fingerprint` | string? | Stable identifier for deduplication |

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|---|---|---|
| Marking all findings as false positives without checking | Normalises ignoring real leaks | Check entropy, context, and file purpose before dismissing |
| Suppressing with `gitleaks:allow` without documenting why | Creates invisible exceptions | Add a comment explaining why the match is safe |
| Reporting findings but not suggesting rotation | Incomplete remediation | Always include rotation steps for high/critical |
| Running on a diff only when secrets may be in history | Misses committed leaks | Combine `scan_diff` (speed) with `scan_secrets` (depth) |

## Examples

### Example 1: Pre-push check, no findings

```
User: I'm about to push. Can you quickly check for leaked secrets?

Agent: Running gitleaks across the workspace in the sandboxed WASM plugin.

⚙ gitleaks.scan_repo ({ path: "/workspace", redact: true })  ● done · 340 ms

No secrets found (1,204 files scanned). ✓ Safe to push.
```

### Example 2: Critical finding with rotation path

```
User: Scan for secrets before I open the PR.

Agent: Found 1 critical finding.

| ▲ CRITICAL | aws-access-token | config/prod.env:14 · commit 7a2c1f8 | AWS_KEY=AKIA**** |

The AWS access key is committed to history in 7a2c1f8. Steps:
1. Rotate the key immediately in the AWS console.
2. Remove from git history: `git filter-repo --path config/prod.env --invert-paths`
3. Force-push the cleaned history (coordinate with your team).
4. Add `config/prod.env` to `.gitignore`.
```

## Quality Checklist

- [ ] All critical and high findings include a rotation or remediation suggestion
- [ ] Committed findings (with `commit` field) include history-rewrite guidance
- [ ] Redacted snippets are shown — raw secrets must not appear in chat
- [ ] Low-severity findings include whether they are likely false positives and why
- [ ] Finding count, file count, and duration are surfaced in the summary line
