---
name: scan-staged-diff
description: "Scans only staged git changes for secrets before a commit completes, using gitleaks@8.30 in WASM. Faster than a full workspace scan; intended as an automated pre-commit gate."
allowed-tools: [mcp__wasmmcp__scan_diff]
---

# Scan Staged Changes for Secrets

Runs `gitleaks detect --staged` through the IDE plugin on every pre-commit event. Only bytes in the git staging area are inspected — unchanged files are not re-scanned. Exits non-zero if any finding meets the configured severity threshold, blocking the commit.

## When to Use

- Automatically on the `on:pre-commit` rule trigger (the default wiring in `catalog/rules/pre_commit.json`)
- When a user says "check what I'm about to commit", "scan my staged files", "pre-commit check"
- As the fast-path complement to `scan-secrets` (which scans the full history)

## When NOT to Use

- As the only form of scanning — staged scanning misses secrets already committed to history; pair with `scan-secrets` on `on:audit`
- When there are no staged changes (the scanner will correctly return no findings; no action needed)
- On repositories without git (use `scan-secrets` full-workspace mode instead)

## Rationalizations to Reject

- **"It's only in the diff for a second."** If it makes it into a commit it is permanent without a history rewrite. Block it now.
- **"I'll fix it after the commit."** Git history is not easily rewritten once pushed. The cost of rotation is the same whether it is caught here or after a breach.

## Execution

Module invocation: `gitleaks@8.30` with `--staged` flag.  
The WASM module reads staged content via `wasi:filesystem` (the host surfaces staged bytes as a preopen).  
Capability set: `["fs:read"]`. No network. No writes.

## Examples

### Example 1: Clean commit

```
on:pre-commit triggered

⚙ gitleaks.scan_diff ({ redact: true })  ● done · 42 ms

No secrets in staged changes. Commit allowed.
```

### Example 2: Blocked commit

```
on:pre-commit triggered

⚙ gitleaks.scan_diff ({ redact: true })  ● done · 38 ms

● HIGH  generic-api-key  src/client.ts:88 · STRIPE_KEY="sk_live_****"

Commit blocked. Move the key to an environment variable or .env file, then re-stage.
```

## Quality Checklist

- [ ] Summary states whether the commit is allowed or blocked
- [ ] Each blocking finding includes the specific file and line
- [ ] Remediation path (env var, .env, secret manager) is suggested
- [ ] Duration and staged-file count are surfaced
