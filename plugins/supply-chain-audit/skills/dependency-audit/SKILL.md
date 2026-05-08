---
name: dependency-audit
description: "Audits third-party dependencies for CVEs, license violations, and typosquatting patterns using a WASM module with an offline advisory database. Invoke on audit events or when package files change."
allowed-tools: [mcp__wasmmcp__scan_secrets, Read, Glob]
---

# Supply Chain Dependency Audit

Analyses package manifests (`package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`, `pyproject.toml`) for:
- **CVEs** — known vulnerabilities in the advisory database bundled with the WASM module
- **License violations** — GPL/AGPL dependencies in proprietary projects, missing attribution
- **Typosquatting** — package names that are edit-distance-close to popular packages

The scan runs entirely offline. No package names, dependency trees, or workspace paths are sent to any remote service.

## When to Use

- On `on:audit` events as part of the full security sweep
- When a `package.json`, `Cargo.toml`, `go.mod`, or `requirements.txt` is modified in a PR
- When a user says "check my dependencies", "audit my packages", "look for vulnerable deps", "supply chain check"
- Before releasing or cutting a new version
- After a CVE disclosure that may affect the dependency ecosystem this project uses

## When NOT to Use

- As a substitute for a full SCA (Software Composition Analysis) tool in CI — this is a fast triage pass, not a complete audit. Production pipelines should also run `npm audit`, `cargo audit`, or `osv-scanner`.
- When the user is asking about *upgrading* dependencies for performance reasons rather than security — redirect to a different workflow
- On vendored dependencies with no manifest (embedded copy-paste code) — use `scan-secrets` and `find-dead-code` on those files instead; advisory databases cannot match inline code

## Rationalizations to Reject

- **"We're pinned to that version and upgrading would break things."** Breakage is temporary; a supply-chain compromise is permanent. Report the finding and let the team plan the upgrade.
- **"It's a dev dependency."** Dev dependencies execute in CI, build pipelines, and developer machines — all are high-value targets for supply-chain attacks. Report them.
- **"The CVE has low CVSS."** CVSS was designed for server-side exposure. Low CVSS CVEs in parsing libraries or crypto primitives frequently have higher practical impact than their score suggests. Surface all findings.
- **"We only import one function from that package."** Transitive dependencies and side-effect imports mean the entire package executes. The attack surface is the full package, not the imported symbol.

## Execution

The skill reads manifest files from the workspace via `wasi:filesystem` and matches against the embedded advisory database. It does not execute `npm install`, `cargo fetch`, or any package manager command.

Capability set: `["fs:read"]`. No network access — the advisory database is bundled in the WASM module at build time and updated with module registry updates.

## Findings Shape

| Field | Type | Description |
|---|---|---|
| `rule` | string | Finding type: `cve`, `license-violation`, `typosquatting` |
| `severity` | `critical \| high \| medium \| low` | CVE severity tier or license risk |
| `path` | string | Manifest file path |
| `line` | number | Line in the manifest where the dependency is declared |
| `redactedSnippet` | string | Package name and version range |
| `advisory` | string? | CVE ID or advisory URL |
| `fixedIn` | string? | First version where the issue is resolved |

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|---|---|---|
| Ignoring transitive dependency findings | Transitive deps are the most common supply-chain attack vector | Surface and triage all findings, including indirect dependencies |
| Upgrading without testing | Dependency upgrades can introduce breaking changes | Recommend upgrade + regression test; do not auto-apply |
| Treating license findings as less urgent than CVEs | GPL contamination can block a product release | Prioritise licence findings for legal review, CVEs for security team |
| Running only on direct dependencies | Most CVEs are in transitive deps | Audit the full resolved dependency tree |

## Examples

### Example 1: CVE in transitive dependency

```
User: Can you check my dependencies for vulnerabilities?

Agent: Reading package manifests and scanning against the advisory database.

⚙ scan_secrets / dependency-audit  ● done · 210 ms  (312 packages, 2 manifests)

Found 2 findings:

| ▲ HIGH     | cve             | package.json:14 | lodash@4.17.20 → CVE-2021-23337 (command injection) — fixed in 4.17.21 |
| ● MEDIUM   | license-violation | Cargo.toml:31 | openssl@0.10.55 → GPL-2.0-only in a proprietary crate                  |

Recommendations:
1. Upgrade lodash to ≥4.17.21.
2. Evaluate replacing openssl with rustls (MIT) or add a legal exception for the GPL dependency.
```

### Example 2: Typosquatting detection

```
Agent: Warning — possible typosquatting detected.

| ▲ HIGH | typosquatting | package.json:8 | "cros-fetch@1.0.2" is edit-distance 1 from "cross-fetch@4.0.0" |

Recommendation: Verify this is intentional. If not, replace with the legitimate package and check
whether "cros-fetch" was ever executed in CI or developer environments.
```

## Quality Checklist

- [ ] Total package count and manifest count are reported in the summary
- [ ] Each CVE finding includes the CVE ID and the fixed version
- [ ] Transitive dependency findings are distinguished from direct dependency findings
- [ ] License findings include the license identifier and the risk category
- [ ] Typosquatting findings include the likely intended package name
- [ ] All findings include a concrete remediation step
