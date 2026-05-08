"use strict";
// MCP host for gitleaks-scanner-wasm — JSON-RPC 2.0 over stdio.
// Cascade connects to this as a subprocess via .windsurf/mcp.json.
// Uses scanner.js (same engine as the panel) to run scans locally.
// No code is sent to any server. No downloads. Workspace bytes never leave this machine.

const path    = require("path");
const scanner = require("./scanner");

const workspaceRoot = path.resolve(process.env.WORKSPACE_ROOT ?? ".");
process.stderr.write(`[gitleaks-mcp] workspace: ${workspaceRoot}\n`);

// ── JSON-RPC 2.0 stdio loop ───────────────────────────────────────────────────

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buf += chunk;
  for (;;) {
    const nl = buf.indexOf("\n");
    if (nl < 0) break;
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) handleLine(line).catch(() => undefined);
  }
});

async function handleLine(line) {
  let req;
  try { req = JSON.parse(line); }
  catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  if (req.id === undefined) return; // notification — no reply needed

  try {
    const result = await route(req.method, req.params ?? {});
    send({ jsonrpc: "2.0", id: req.id, result });
  } catch (err) {
    send({ jsonrpc: "2.0", id: req.id, error: { code: err.code ?? -32000, message: err.message } });
  }
}

// ── Method router ─────────────────────────────────────────────────────────────

async function route(method, params) {
  switch (method) {

    case "initialize":
      return {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "gitleaks-scanner-wasm", version: "1.0.0" },
        capabilities: { tools: { listChanged: false } },
        _meta: {
          workspaceRoot,
          dataPath: "workspace bytes never leave this machine — scanned by local gitleaks engine"
        }
      };

    case "tools/list":
      return { tools: TOOLS };

    case "tools/call": {
      const name = params.name;
      if (!name) { const e = new Error("params.name required"); e.code = -32602; throw e; }
      const args = params.arguments ?? {};
      if (name === "gitleaks_scan_workspace") return runScan(args);
      if (name === "gitleaks_scan_staged")    return runScan(args);
      const e = new Error(`Unknown tool: "${name}"`); e.code = -32601; throw e;
    }

    case "resources/list":
      return { resources: [] };

    default: {
      const e = new Error(`Method not found: ${method}`); e.code = -32601; throw e;
    }
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "gitleaks_scan_workspace",
    description:
      "Scan the full workspace for hardcoded secrets, API keys, tokens, and credentials " +
      "using gitleaks rules (WASM / native binary / JS mock). " +
      "Runs entirely locally — no code leaves this machine.",
    inputSchema: {
      type: "object",
      properties: {
        redact:   { type: "boolean", default: true,  description: "Redact secret values in output." },
        severity: { type: "string",  default: "low+", description: "Minimum severity: critical | high | medium | low+" }
      }
    },
    annotations: { readOnlyHint: true, idempotentHint: true }
  },
  {
    name: "gitleaks_scan_staged",
    description:
      "Scan staged / uncommitted changes for hardcoded secrets before committing. " +
      "Runs entirely locally — no code leaves this machine.",
    inputSchema: {
      type: "object",
      properties: {
        redact: { type: "boolean", default: true, description: "Redact secret values in output." }
      }
    },
    annotations: { readOnlyHint: true, idempotentHint: true }
  }
];

// ── Scan execution ────────────────────────────────────────────────────────────

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SEV_ICON = { critical: "🔴", high: "▲", medium: "●", low: "○", info: "·" };

async function runScan(args) {
  const redact  = args.redact !== false;
  const minSev  = parseSevThreshold(args.severity ?? "low+");

  const result = await scanner.scanWorkspace(workspaceRoot, { redact });
  return renderFindings(result.findings, result, minSev);
}

// ── Findings renderer ─────────────────────────────────────────────────────────

function renderFindings(findings, meta, minSev) {
  const filtered = findings
    .filter(f => (SEV_RANK[f.severity] ?? 4) <= minSev)
    .sort((a, b) => (SEV_RANK[a.severity] ?? 99) - (SEV_RANK[b.severity] ?? 99));

  let text;
  if (filtered.length === 0) {
    const scanned = meta.filesScanned ? ` (${meta.filesScanned} files scanned)` : "";
    const dur     = meta.durationMs   ? ` in ${meta.durationMs} ms`             : "";
    text = `No secrets found${scanned}${dur}. ✓`;
  } else {
    const dur   = meta.durationMs   ? ` in ${meta.durationMs} ms`            : "";
    const scan  = meta.filesScanned ? `, ${meta.filesScanned} files scanned` : "";
    const counts = {};
    for (const f of filtered) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    const summary = Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(" · ");

    const rows = filtered.map(f => {
      const icon = SEV_ICON[f.severity] ?? "·";
      const loc  = f.commit
        ? `${f.path}:${f.line} · commit ${f.commit.slice(0, 8)}`
        : `${f.path}:${f.line}`;
      const snip = (f.snippet ?? "").slice(0, 60);
      return `| ${icon} ${f.severity.toUpperCase()} | \`${f.rule}\` | \`${loc}\` | ${snip} |`;
    });

    text = [
      `Found **${filtered.length} secret finding(s)** (${summary})${dur}${scan}.`,
      "",
      "| Severity | Rule | Location | Snippet |",
      "|---|---|---|---|",
      ...rows
    ].join("\n");
  }

  const content = [{ type: "text", text }];

  if (filtered.length > 0) {
    const token = "scan-" + Math.random().toString(36).slice(2, 8);
    content.push({
      type: "resource",
      resource: {
        uri:      `mcp://findings/${token}/findings.json`,
        mimeType: "application/json",
        text:     JSON.stringify({ findings: filtered, meta }, null, 2)
      }
    });
  }

  return {
    content,
    isError: false,
    _meta: {
      findingCount: filtered.length,
      filesScanned: meta.filesScanned ?? 0,
      durationMs:   meta.durationMs   ?? 0
    }
  };
}

function parseSevThreshold(spec) {
  return SEV_RANK[spec.replace(/\+$/, "").trim()] ?? 3;
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
