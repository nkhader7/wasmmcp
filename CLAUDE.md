# WASM Plugin + MCP Skill Dispatcher — Architecture Ground Truth

Use this spec as the single source of truth. Do not invent components outside it; ask before extending.

---

## System summary

A coding-agent IDE (Windsurf, Cursor, Claude Code, Continue, or any MCP-compatible client) ships a **first-party WASM plugin**. That plugin contains a `wasmtime` runtime, a local module registry of signed `.wasm` modules (e.g. `gitleaks@8.21`, `semgrep@1.45`, `ripgrep@14`, `tree-sitter@0.22`), and a dispatcher.

A separate **MCP server** (remote or sidecar) publishes **skills** and **rules** — declarative recipes that map user intent to `{ module, args, when-to-use }`. The MCP server **never receives source code and never runs WASM**. It only resolves which module the IDE plugin should invoke.

When the user prompts the agent, the agent's MCP client calls `tools/call` against the MCP server, gets back a module reference + args + capability set, and invokes the local WASM plugin in-process. The WASM module scans the workspace through a capability-confined `wasi:filesystem` preopen and streams structured findings back into chat.

---

## Trust + data boundaries (invariants — never violate)

- **Workspace bytes never leave the IDE process.** The MCP server only sees the skill name, args, and findings the user explicitly returns.
- **WASM modules cannot exfiltrate.** No `wasi:sockets` linked. Filesystem is read-only, path-confined, no symlink follow.
- **MCP server is thin.** It dispatches skills and rules. It is not a WASM host. Org-managed central rule catalogs are the intended deployment.
- **Plugin is first-party.** Bundled with the IDE, not user-installed. New scanners reach users as module updates inside the registry.

---

## Components

### 1. IDE process (trust: user, local)

- **Coding agent (MCP client)**: LLM planner + skill registry cache + plugin bridge (in-process IPC to the WASM host).
- **WASM plugin (bundled)**:
  - `wasmtime 24` runtime — linker, store, component instance, fuel cap (5e9), epoch interrupts (10 ms), 256 MB memory cap.
  - **Capability broker** — builds a per-invocation linker. Imports outside the manifest are absent or trap with `ENOTSUP` / `EACCES`.
  - **Module registry** — `~/.<ide>/modules/`, cosign-verified, indexed by `name@version + sha256`.
  - **Dispatcher** — resolves skill → module, marshals args into WIT types, streams stdout/stderr + structured findings out.
  - **Active instance** — e.g. `gitleaks.wasm`, exporting `scan_repo` / `scan_diff`, importing `wasi:filesystem/preopens`, `wasi:io/streams`, `wasi:clocks/monotonic-clock`.
- **User workspace** — preopened read-only into the WASM instance as `/workspace` fd=3.

### 2. MCP server (trust: org, remote or sidecar)

- **Transport**: JSON-RPC 2.0 over stdio or http+sse. MCP spec `2025-06-18`.
- **Skills catalog** — markdown + frontmatter:
  ```yaml
  module: gitleaks@8.21
  when: "pre-commit, audit"
  args: { redact: true, severity: "low+" }
  ```
- **Rules catalog** — declarative triggers: `on:pre-commit → scan_secrets`, `on:open-pr → find_dead_code`, `on:audit → all`.
- **Module ref response** — returns `{ module, version, sha256, args, caps }`. Never bytes.

---

## Capability model (per invocation)

| WASI import | Status | Notes |
|---|---|---|
| `wasi:filesystem/preopens` | granted | `/workspace` read-only, fd=3 |
| `wasi:io/streams` | granted | host-buffered |
| `wasi:cli/stdout · stderr` | granted | piped to plugin log |
| `wasi:clocks/monotonic-clock` | granted | wall-clock denied |
| `wasi:random/random` | granted | deterministic per-invocation seed |
| `wasi:cli/environment` | scoped | allowlist only |
| `wasi:filesystem` write paths | denied | broker returns `EACCES` |
| `wasi:sockets/*` | denied | not linked, traps `ENOTSUP` |

`plugin.toml` declares all imports at packaging time; instantiation fails if any declared import is not satisfied. No fallback to ambient authority.

---

## Wire flow (one invocation, end-to-end)

```
t=0      client → mcp        initialize { protocolVersion, clientInfo }
+12ms    mcp → client        result { capabilities.tools.listChanged: true }
+14ms    client → mcp        tools/list
+16ms    mcp → client        [ scan_secrets, find_dead_code, grep_repo, parse_ast ]
+21ms    client → mcp        tools/call { name: "scan_secrets", args: { path: "/workspace" } }
+22ms    mcp → client        result._meta.invokeLocal {
                                module: "gitleaks@8.21",
                                sha256: "9f1e…b203",
                                args:   { path: "/workspace", redact: true },
                                caps:   ["fs:read"]
                              }
+24ms    ide plugin (local)  registry.resolve(module, sha256)
                              linker.define_wasi(store, broker.from(caps, args))
                              instance.scan_repo(args)  ← in-process call
+86ms    server → client     notifications/progress { progress: 3412/12418 }
+1.4s    server → client     result.content [ text summary, resource://findings.json ]
                              _meta { durationMs: 1376, fuelConsumed: 847_220_416 }
```

---

## Reference module: gitleaks

- Source: Go CLI, `cgo=0`.
- Build: `tinygo build -target=wasip2 -o gitleaks.wasm ./cmd/gitleaks` → 6.4 MB.
- Packaged as OCI artifact, cosign-signed.
- Exports: `scan_repo(args) → ScanResult`, `scan_diff(args) → ScanResult`.
- Findings shape: `{ rule, severity, path, line, redactedSnippet, commit? }`.

---

## Common tasks

1. **Author a new skill** — write a markdown skill file pointing at a module.
2. **Author a new rule** — declarative trigger that fires a skill on a workspace event.
3. **Wrap a new native CLI as a WASM module** — TinyGo / Rust `wasm32-wasip2`, declare WIT world, manifest capabilities, sign, publish to module registry.
4. **Extend the capability broker** — add a new gated WASI namespace (e.g. scoped HTTP).
5. **Render findings in chat** — design the agent-facing structured-content shape so the LLM can summarize and propose follow-ups.
6. **Reason about a security boundary** — given a proposed change, identify which invariant it threatens.

---

## Hard rules

- The MCP server **must not** be described as a WASM host. It is a dispatcher.
- The WASM module **must not** be placed on the MCP server side. It lives in the IDE process.
- Workspace data **must not** flow through the MCP server.
- Any new capability **must** appear in the manifest and the broker; no ambient authority.
- Modules are referenced by `name@version + sha256`, never by URL at invocation time.
