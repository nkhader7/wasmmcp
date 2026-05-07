# WASM Plugin Architecture · gitleaks via MCP

> **v0.3 · 2026-05-06**
>
> A WASM plugin lives inside the IDE. An MCP server tells it which module to run. *// gitleaks reference build*

The IDE (Windsurf, Cursor, Claude Code, Continue) ships a single first-party plugin: a WASM runtime + a registry of signed modules. When the user prompts the agent, the agent's MCP client connects to a remote MCP server that exposes *skills* and *rules* — these are recipes that name a module + arguments. The IDE plugin executes the matching WASM module locally against the open repo and streams structured findings back into chat. **The MCP server never sees the code; the WASM module never reaches the network.**

| | |
|---|---|
| **IDE plugin** | wasmtime 24 + module registry |
| **MCP server role** | skills + rules dispatcher |
| **Module example** | gitleaks v8.21.2 · wasm32-wasip2 |
| **Data path** | repo never leaves IDE |

---

## Run

```powershell
npm test
npm run demo
```

`npm run mcp` starts the JSON-RPC stdio MCP dispatcher.

---

## Project layout

```
wasmmcp/
├── catalog/
│   ├── skills/         # markdown skills with frontmatter (module + args + when)
│   └── rules/          # declarative event rules (on:pre-commit → scan_secrets)
├── modules/
│   └── index.json      # local, cosign-verified module registry index
└── src/
    ├── mcp/            # MCP dispatcher only (JSON-RPC 2.0 over stdio)
    └── plugin/         # local IDE plugin boundary (capability broker + wasm host)
```

- `catalog/skills/` — skill definitions: which module to invoke, when, and with what args.
- `catalog/rules/` — declarative event rules; org-managed, applied automatically.
- `modules/index.json` — local, cosign-verified module registry index.
- `src/mcp/` — MCP dispatcher only; never receives source code or runs WASM.
- `src/plugin/` — implements the local IDE plugin boundary.
- `src/plugin/wasm-host.js` — local mock of a WASM host call. Preserves the data boundary and capability checks but does not embed wasmtime.

---

## § 01 · IDE-bundled plugin & remote skill server

`SOURCE → SKILL → LOCAL WASM EXEC`

### Four-stage pipeline

**[01] IDE ships the plugin**
Windsurf / Cursor / Claude Code bundle a single WASM plugin: a wasmtime runtime plus a local module registry. Zero install for the user.

```
~/.windsurf/plugin/
  ├ runtime/wasmtime
  ├ registry/index.json
  └ modules/*.wasm
```

**[02] MCP server hosts skills**
A remote (or local) MCP server publishes *skills* and *rules* — recipes the agent can invoke. Each skill names a WASM module + args + when to use it.

```yaml
# skills/scan-secrets.md
module: gitleaks@8.21.2
when:   "pre-commit, audit"
args:
  redact: true
  severity: "low+"
```

**[03] Agent picks the skill**
Model sees skill list via `tools/list`, matches user intent to a skill, and calls it. The skill carries a module ID — not code.

```json
// tools/call from agent
{
  "name": "scan_secrets",
  "arguments": { "path": "/workspace" }
}
```

**[04] IDE runs the WASM**
MCP server resolves the skill to `gitleaks@8.21.2`, asks the IDE plugin to invoke it. WASM scans the repo locally; results stream to chat.

```js
// IDE plugin invokes
plugin.invoke({
  module: "gitleaks@8.21.2",
  caps:   ["fs:read"],
  args:   { … }
})
```

### Compatible IDE hosts

| IDE | Config | Status |
|---|---|---|
| Windsurf | Cascade · MCP 1.0 | ✓ compatible |
| Cursor | `~/.cursor/mcp.json` | ✓ compatible |
| Claude Code | `claude mcp add` | ✓ compatible |
| Continue | `continue/config.yaml` | ✓ compatible |
| Any MCP host | stdio · JSON-RPC 2.0 | ✓ compatible |

---

## § 02 · Runtime architecture

`IDE PLUGIN HOLDS WASM · MCP SERVER DISPATCHES`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ IDE PROCESS · TRUST: USER · LOCAL MACHINE · windsurf · cursor · claude code  │
│                                                                              │
│  ┌──────────┐      ┌──────────────────────────────────────────────────────┐  │
│  │  User    │─────▶│  CODING AGENT · MCP CLIENT                           │  │
│  │ Chat in  │      │  LLM loop + tool router                              │  │
│  └──────────┘      │  ┌────────────────────┐  ┌────────────────────────┐  │  │
│                    │  │   LLM planner      │  │   skill registry       │  │  │
│                    │  │  claude/gpt/gemini │  │   cache from MCP       │  │  │
│                    │  └────────────────────┘  └────────────────────────┘  │  │
│                    │  ┌─────────────────────────────────────────────────┐  │  │
│                    │  │  plugin bridge · in-process IPC → wasm host     │  │  │
│                    │  └───────────────────────┬─────────────────────────┘  │  │
│                    └──────────────────────────┼─────────────────────────────┘  │
│                                               │ plugin.invoke(module, args)  │
│                                               ▼                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │  WASM PLUGIN · BUNDLED WITH IDE · First-party. Single binary.        │    │
│  │                                                                      │    │
│  │  ┌──────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │    │
│  │  │  wasmtime 24     │  │  module registry   │  │  dispatcher      │  │    │
│  │  │  linker · store  │  │ ~/.windsurf/modules│  │  resolve(skill)  │  │    │
│  │  │  component model │  │  gitleaks@8.21.2   │  │  → module        │  │    │
│  │  │  fuel · epoch    │  │  semgrep@1.90      │  │  map args →      │  │    │
│  │  │  256 MB cap      │  │  ripgrep@14        │  │  wit types       │  │    │
│  │  │  cap broker →    │  │  cosign-verified   │  │  stream findings │  │    │
│  │  │    fs:read only  │  └────────────────────┘  └──────────────────┘  │    │
│  │  │    no sockets    │                                                  │    │
│  │  │    no fs:write   │                                                  │    │
│  │  └──────────────────┘                                                  │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────────────────────────┐    │    │
│  │  │  ACTIVE INSTANCE                                             │    │    │
│  │  │  gitleaks.wasm  ·  exports: scan_repo, scan_diff             │    │    │
│  │  │  imports: wasi:filesystem/preopens · wasi:io/streams         │    │    │
│  │  │           wasi:clocks/monotonic-clock                        │    │    │
│  │  └──────────────────────────┬───────────────────────────────────┘    │    │
│  │                             │ wasi:filesystem.read-via-stream        │    │
│  │  ┌──────────────────────────▼───────────────────────────────────┐    │    │
│  │  │  USER WORKSPACE · MOUNTED INTO PLUGIN                        │    │    │
│  │  │  /workspace (preopen, read-only)                             │    │    │
│  │  │  .git/ · src/ · *.env · 12,418 files                         │    │    │
│  │  │  path-confined · symlinks not followed                       │    │    │
│  │  │  workspace bytes never cross the IDE process boundary        │    │    │
│  │  └──────────────────────────────────────────────────────────────┘    │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
              ▲  tools/call "scan_secrets"        │
              │                                   ▼ structured findings · stream
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  MCP SERVER · REMOTE OR SIDECAR
│                                                                               │
  ┌──────────────────────────────────────────────────────────────────────┐
│ │  DISPATCHER · NOT A WASM HOST                                        │ │
  │  Skill + rule catalog · JSON-RPC 2.0 · stdio or http+sse            │
│ │  returns: skill name + module ref + args                             │ │
  │  never receives source bytes                                         │
│ └──────────────────────────────────────────────────────────────────────┘ │

│  SKILLS                                RULES                               │
   scan_secrets  → gitleaks@8.21.2       on:pre-commit   → scan_secrets
│  find_dead_code → semgrep@1.90         on:branch-push  → scan_secrets      │
   grep_repo     → ripgrep@14            on:open-pr      → find_dead_code
│  parse_ast     → tree-sitter@0.23      on:audit        → all               │
   authored as markdown + frontmatter    declarative · org-managed
│                                                                               │
  MODULE REF (POINTER ONLY — not bytes)
│  name: "gitleaks"  ·  version: "8.21"  ·  sha256: 9f1e…b203                 │
   IDE looks it up in local registry
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

### Legend

| | Meaning |
|---|---|
| Green arrows | request / invocation |
| Purple arrows | MCP JSON-RPC |
| Cyan arrows | wasmtime host calls |
| Orange arrows | capability-mediated I/O |
| `- - -` boundary | trust boundary |

---

## § 03 · Plugin manifest & capability grants

`DECLARATIVE TRUST · ENFORCED AT LINK TIME`

### `plugin.toml`

The manifest pins the WIT world the module imports/exports, declares the tool surface, and lists every capability the host must satisfy. Any import not satisfied at link time **fails instantiation** — there is no fallback to ambient authority.

```toml
# OCI artifact: gitleaks-wasm:8.21.2
[plugin]
name        = "gitleaks"
version     = "8.21.2-wasi"
entry       = "gitleaks.wasm"
world       = "mcp:plugin/scanner@0.1"

[runtime]
engine      = "wasmtime"
fuel        = 5_000_000_000
memory_max  = "256MB"
epoch_ms    = 10

[[tools]]
name   = "scan_repo"
schema = "./schemas/scan_repo.json"

[[tools]]
name   = "scan_diff"
schema = "./schemas/scan_diff.json"

[capabilities]
fs.read   = ["$WORKSPACE/**"]
fs.write  = []                  # DENY
net       = []                  # DENY
env.allow = ["GITLEAKS_CONFIG"]
clock     = "monotonic"         # no wall clock

[signatures]
cosign = "sha256:9f1e…b203"
```

### Capability broker decisions

At `tools/call` the broker materializes a **per-invocation** linker. Anything outside the manifest is either absent from the linker or returns a deterministic error.

| Capability | Decision | Detail |
|---|---|---|
| `wasi:filesystem/preopens` | ✓ granted | preopen `/workspace` as fd=3, read-only, symlinks not followed |
| `wasi:cli/stdout · stderr` | ✓ granted | captured by host, never written to TTY |
| `wasi:clocks/monotonic-clock` | ✓ granted | wall-clock denied (privacy / non-determinism) |
| `wasi:sockets/*` | ✗ denied | not linked — TCP connect traps with `errno=ENOTSUP` |
| `wasi:filesystem` (write paths) | ✗ denied | `open-at(O_WRONLY)` returns `EACCES` at the broker |
| `wasi:cli/environment` | ⚠ scoped | only `GITLEAKS_CONFIG` exposed; all others return `""` |

### Full WASI Preview-2 link table for `gitleaks.wasm`

| Interface | Resolution |
|---|---|
| `wasi:io/streams@0.2` | `input-stream.read` · `output-stream.write` · `pollable.ready` · backed by host buffers |
| `wasi:filesystem/types@0.2` | `descriptor.read-via-stream` · `descriptor.stat` · `descriptor-flags = { read }` |
| `wasi:filesystem/preopens@0.2` | `get-directories()` → `[(fd=3, "/workspace")]` |
| `wasi:cli/stdin · stdout · stderr` | stdin = empty · stdout/stderr piped to MCP server log |
| `wasi:clocks/monotonic-clock@0.2` | `now()` · `resolution()` — wall-clock import absent |
| `wasi:random/random@0.2` | deterministic per-invocation seed (host-provided), not `/dev/urandom` |
| `wasi:cli/environment@0.2` | filtered: returns only `[(GITLEAKS_CONFIG, …)]` |
| `mcp:plugin/host@0.1` *(custom)* | `progress-report` · `log-event` · `structured-finding` (host imports for streaming back) |

---

## § 04 · MCP wire trace

`SKILL DISPATCH → LOCAL PLUGIN INVOKE → STREAMED RESULT`

```
t = 0      client → server
           // initialize handshake
           { "jsonrpc": "2.0", "id": 1, "method": "initialize",
             "params": { "protocolVersion": "2025-06-18",
                         "capabilities": { "tools": {}, "sampling": {} },
                         "clientInfo": { "name": "windsurf", "version": "1.10.4" } } }

+ 12 ms    server → client
           { "jsonrpc": "2.0", "id": 1, "result": {
               "protocolVersion": "2025-06-18",
               "capabilities": { "tools": { "listChanged": true } },
               "serverInfo": { "name": "wasm-plugin-host", "version": "0.3.1" } } }

+ 14 ms    client → server
           // LLM decided which tool; agent dispatches
           { "jsonrpc": "2.0", "id": 2, "method": "tools/list" }

+ 16 ms    server → client
           { "id": 2, "result": { "tools": [
               { "name": "scan_repo",
                 "description": "Scan workspace for hardcoded secrets via gitleaks rules",
                 "inputSchema": { "type": "object",
                   "properties": { "path":   { "type": "string" },
                                   "redact": { "type": "boolean", "default": true } } } },
               { "name": "scan_diff", "description": "Scan staged changes only", … }
           ] } }

+ 21 ms    client → server
           // model emitted tool_use; agent forwards
           { "id": 3, "method": "tools/call",
             "params": { "name": "scan_repo",
                         "arguments": { "path": "/workspace", "redact": true },
                         "_meta": { "progressToken": "scan-7f3a" } } }

+ 22 ms    mcp → client
           // MCP server resolves the skill to a module ref + args.
           // It does NOT receive code or run the module itself.
           { "id": 3, "result": {
               "_meta": { "skillResolved": "scan_secrets",
                          "invokeLocal": {
                            "module": "gitleaks@8.21.2",
                            "sha256": "9f1e…b203",
                            "args":   { "path": "/workspace", "redact": true },
                            "caps":   ["fs:read"] } } } }

+ 24 ms    ide plugin → wasm
           // IDE plugin (in-process) looks up module in local registry,
           // instantiates with broker-built linker, calls export.
           let module = registry.resolve("gitleaks@8.21.2", "sha256:9f1e…b203")?;
           linker.define_wasi(&store, CapabilityBroker::from(caps, args));
           let instance = module.instantiate(&mut store)?;
           let scan = instance.get_typed_func::<_, ScanResult>("scan-repo")?;
           scan.call_async(&mut store, ScanArgs { path: "/workspace", redact: true }).await

+ 86 ms    server → client
           // streamed progress notification (no id)
           { "method": "notifications/progress",
             "params": { "progressToken": "scan-7f3a",
                         "progress": 3412, "total": 12418,
                         "message": "scanning src/lib/…" } }

+ 1.4 s    server → client
           { "id": 3, "result": {
               "content": [
                 { "type": "text",     "text": "3 findings · 1 high · 2 medium" },
                 { "type": "resource", "resource": { "uri": "mcp://scan-7f3a/findings.json",
                                                     "mimeType": "application/json" } }
               ],
               "isError": false,
               "_meta": { "durationMs": 1376,
                          "fuelConsumed": 847_220_416,
                          "filesScanned": 12418 } } }
```

---

## § 05 · Result rendering in the agent chat

`STRUCTURED CONTENT → LLM FOLLOWUP → USER`

**User:** Before I push this branch, can you check if I accidentally committed any secrets? Run a full scan on the repo.

**Agent:** I'll run gitleaks across the workspace. The plugin runs in a sandboxed WASM runtime with read-only access to your repo — nothing leaves your machine.

```
⚙ gitleaks.scan_repo ({ path: "/workspace", redact: true })
  fuel: 847M / 5B · scanned 12,418 files · 3 findings        ● done · 1.4s
```

Found **3 leaked secrets**. The high-severity one is in `config/prod.env` and is committed to `main` — you'll want to rotate it before anything else.

| Severity | Rule | Location | Secret |
|---|---|---|---|
| ▲ HIGH | `aws-access-key-id` | `config/prod.env:14` · committed in `7a2c1f8` | `AWS_ACCESS_KEY=AKIA****************` |
| ● MED | `generic-api-key` | `src/integrations/stripe.ts:42` · uncommitted | `const STRIPE_KEY = "sk_live_***…"` |
| ○ LOW | `private-key` | `.env.example:3` · likely false positive | `JWT_PRIVATE=-----BEGIN…` |

Want me to (a) draft a rotation checklist for the AWS key, (b) move the Stripe key to `.env` + add to `.gitignore`, or (c) suppress the false positive with a `gitleaks:allow` annotation?

---

## § 06 · Why this shape

`DESIGN INVARIANTS`

### 01 · Plugin lives in the IDE — one bundle, every workflow

The WASM runtime + module registry ships inside the IDE itself. New scanners, parsers, or analyzers reach the user as module updates — no separate install, no subprocess, no permission prompts mid-session.

| | |
|---|---|
| Footprint | ~12 MB runtime + N modules |
| Cold start | ~80 ms (module cached) |
| Platforms | any with wasmtime |

### 02 · Capability-secure — the plugin can't surprise you

Every system call the plugin can make is in the manifest. No ambient filesystem. No network. No env. The broker constructs a fresh linker per invocation — exfiltration of secrets it just *scanned for* is structurally impossible.

| | |
|---|---|
| Net egress | 0 (no sockets linked) |
| Write paths | 0 (read-only preopen) |
| Side channels | fuel + epoch bound |

### 03 · MCP server stays thin — skills + rules, not code

The MCP server only catalogs *which* module to invoke and *when*. It never receives source code, never runs WASM, and can be run by orgs to centrally manage rules without proxying any data. Workspace bytes never leave the IDE process.

| | |
|---|---|
| Spec | MCP 2025-06-18 |
| Transport | stdio · http+sse |
| Server payload | module ref only |

---

*WASM plugin architecture · v0.3 · 2026-05-06*
