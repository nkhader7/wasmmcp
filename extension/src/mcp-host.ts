// Embedded MCP server — JSON-RPC 2.0 over stdio.
// Cascade (Windsurf) connects to this as a stdio subprocess via .windsurf/mcp.json.
// The PluginBridge executes scans locally inside the extension process tree.
// Nothing is downloaded. No code is sent to the MCP server. Workspace bytes
// never leave this machine.
//
// Flow:
//   Cascade → tools/call (stdio) → mcp-host → PluginBridge.invoke() → findings → Cascade

import * as fs   from "node:fs";
import * as path from "node:path";
import { PluginBridge } from "./plugin-bridge";
import type { Finding } from "./types";
import { SEVERITY_RANK } from "./types";

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const workspaceRoot = path.resolve(process.env["WORKSPACE_ROOT"] ?? ".");
const extensionRoot = path.resolve(__dirname, "..");
const catalogDir    = path.resolve(extensionRoot, "../../catalog/skills");

const bridge = new PluginBridge(extensionRoot);
const skills = loadSkillsSync(catalogDir);

process.stderr.write(`[mcp-host] workspace : ${workspaceRoot}\n`);
process.stderr.write(`[mcp-host] skills    : ${skills.size} loaded from ${catalogDir}\n`);

// ── JSON-RPC 2.0 stdio loop ───────────────────────────────────────────────────

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buf += chunk;
  for (;;) {
    const nl = buf.indexOf("\n");
    if (nl < 0) break;
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) handleLine(line).catch(() => undefined);
  }
});

async function handleLine(line: string): Promise<void> {
  let req: any;
  try { req = JSON.parse(line); }
  catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  if (req.id === undefined) return; // notification — no reply

  try {
    const result = await route(req.method as string, req.params ?? {});
    send({ jsonrpc: "2.0", id: req.id, result });
  } catch (err: any) {
    send({ jsonrpc: "2.0", id: req.id, error: { code: err.code ?? -32000, message: err.message } });
  }
}

// ── Method router ─────────────────────────────────────────────────────────────

async function route(method: string, params: any): Promise<any> {
  switch (method) {

    case "initialize":
      return {
        protocolVersion: "2025-06-18",
        serverInfo: { name: "wasmmcp-vsix", version: "0.3.0" },
        capabilities: { tools: { listChanged: false } },
        _meta: {
          mode:        "vsix-embedded",   // running inside extension, not remote
          workspaceRoot,
          totalSkills: skills.size,
          dataPath:    "workspace bytes never leave this machine"
        }
      };

    case "tools/list":
      return { tools: [...skills.values()].map(skillToTool) };

    case "tools/call": {
      const name: string = params.name;
      if (!name) { const e: any = new Error("params.name required"); e.code = -32602; throw e; }
      const skill = skills.get(name);
      if (!skill) { const e: any = new Error(`Unknown tool: "${name}"`); e.code = -32601; throw e; }
      const merged = { ...skill.args, ...(params.arguments ?? {}) };
      return executeSkill(skill, merged, params._meta?.progressToken);
    }

    case "resources/list":
      return { resources: [] };

    default: {
      const e: any = new Error(`Method not found: ${method}`); e.code = -32601; throw e;
    }
  }
}

// ── Skill execution ───────────────────────────────────────────────────────────
// Only gitleaks (scan_repo / scan_diff) and ripgrep (grep) are handled locally.
// All other modules return a clear "not supported" message — nothing is fetched.

async function executeSkill(skill: Skill, args: Record<string, unknown>, progressToken?: string): Promise<any> {
  const mod = skill.module;

  if (mod.startsWith("gitleaks")) {
    const exp   = skill.exportName === "scan_diff" ? "scan_diff" : "scan_repo";
    const result = await bridge.invoke(
      exp as any,
      { redact: args["redact"] !== false, path: String(args["path"] ?? workspaceRoot) },
      workspaceRoot
    );
    return renderFindings(result.findings, result._meta, progressToken);
  }

  if (mod.startsWith("ripgrep")) {
    const query     = String(args["query"] ?? "");
    const maxMatch  = Number(args["maxMatches"] ?? 1000);
    if (!query) return textContent("No `query` argument supplied.");
    const started   = Date.now();
    const findings  = grepWorkspace(workspaceRoot, query, maxMatch);
    return renderFindings(findings, { durationMs: Date.now() - started, filesScanned: 0 }, progressToken);
  }

  // Module not supported in VSIX embedded mode — no download, no remote call
  return textContent(
    `Module \`${mod}\` is not available in the VSIX embedded host.\n` +
    "Supported modules: `gitleaks` (secret scanning), `ripgrep` (text search).\n" +
    "To enable `semgrep` and `tree-sitter`, use the full VSIX extension with wasmtime (Path B)."
  );
}

// ── Findings renderer ─────────────────────────────────────────────────────────

const SEV_ICON: Record<string, string> = {
  critical: "🔴", high: "▲", medium: "●", low: "○", info: "·"
};

function renderFindings(findings: Finding[], meta: any, progressToken?: string): any {
  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99)
  );

  let text: string;
  if (sorted.length === 0) {
    const scanned = meta.filesScanned ? ` (${meta.filesScanned} files scanned)` : "";
    text = `No findings${scanned}. ✓`;
  } else {
    const dur    = meta.durationMs   ? ` in ${meta.durationMs} ms`       : "";
    const scanned = meta.filesScanned ? `, ${meta.filesScanned} files`     : "";
    const header = `Found **${sorted.length} finding(s)**${dur}${scanned}.\n\n`;
    const rows   = sorted.map(f => {
      const icon  = SEV_ICON[f.severity] ?? "·";
      const loc   = f.commit
        ? `${f.path}:${f.line} · commit ${f.commit.slice(0, 8)}`
        : `${f.path}:${f.line}`;
      const snip  = (f.redactedSnippet ?? "").slice(0, 60);
      return `| ${icon} ${f.severity.toUpperCase()} | \`${f.rule}\` | \`${loc}\` | ${snip} |`;
    });
    text = header + [
      "| Severity | Rule | Location | Snippet |",
      "|---|---|---|---|",
      ...rows
    ].join("\n");
  }

  const content: any[] = [{ type: "text", text }];
  if (sorted.length > 0) {
    const token = progressToken ?? "scan-" + Math.random().toString(36).slice(2, 8);
    content.push({
      type: "resource",
      resource: {
        uri:      `mcp://findings/${token}/findings.json`,
        mimeType: "application/json",
        text:     JSON.stringify({ findings: sorted, _meta: meta }, null, 2)
      }
    });
  }

  return { content, isError: false, _meta: { findingCount: sorted.length, ...meta } };
}

// ── Inline ripgrep (text search) ──────────────────────────────────────────────

const GREP_SKIP = [/node_modules/, /\.git/, /\.(wasm|jpg|jpeg|png|gif|pdf|exe|dll|bin)$/i];

function grepWorkspace(root: string, query: string, maxMatches: number): Finding[] {
  const results: Finding[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (results.length >= maxMatches) return;
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!["node_modules", ".git", "vendor", "target", "out", "dist"].includes(e.name)) walk(full);
        continue;
      }
      if (!e.isFile() || GREP_SKIP.some(r => r.test(full))) continue;
      let text: string;
      try { text = fs.readFileSync(full, "utf8"); } catch { continue; }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxMatches) return;
        if (lines[i].includes(query)) {
          const rel = "/workspace/" + path.relative(root, full).replace(/\\/g, "/");
          results.push({ rule: "text-match", severity: "info", path: rel, line: i + 1, redactedSnippet: lines[i].trim() });
        }
      }
    }
  }

  walk(root);
  return results;
}

// ── Skill catalog loader ──────────────────────────────────────────────────────

interface Skill {
  name:        string;
  description: string;
  exportName:  string;
  module:      string;
  args:        Record<string, unknown>;
  when:        string[];
}

function loadSkillsSync(dir: string): Map<string, Skill> {
  const map = new Map<string, Skill>();
  if (!fs.existsSync(dir)) return map;

  for (const file of fs.readdirSync(dir)) {
    const lower = file.toLowerCase();
    if (!lower.endsWith(".md")) continue;
    if (lower === "readme.md" || lower === "skill_template.md" || lower.startsWith("_")) continue;
    try {
      const text = fs.readFileSync(path.join(dir, file), "utf8");
      const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/s);
      if (!m) continue;
      const meta = parseFrontmatter(m[1]);
      const moduleStr = String(meta["module"] ?? "");
      if (!moduleStr.includes("@")) continue;
      const name = String(meta["name"] ?? path.basename(file, ".md"));
      map.set(name, {
        name,
        description: String(meta["description"] ?? `Run ${moduleStr} locally.`),
        exportName:  String(meta["export"] ?? "scan"),
        module:      moduleStr,
        args:        (meta["args"] as Record<string, unknown>) ?? {},
        when:        String(meta["when"] ?? "").split(",").map((s: string) => s.trim()).filter(Boolean)
      });
    } catch { /* skip malformed skill files */ }
  }
  return map;
}

function skillToTool(skill: Skill): any {
  return {
    name:        skill.name,
    description: skill.description,
    inputSchema: {
      type: "object",
      properties: {
        path:       { type: "string",  default: "/workspace",   description: "Workspace root to scan." },
        severity:   { type: "string",  default: "low+",         description: "Minimum severity threshold." },
        redact:     { type: "boolean", default: true,           description: "Redact secret values in output." },
        query:      { type: "string",                           description: "Search query (ripgrep skills)." },
        maxMatches: { type: "number",  default: 1000,           description: "Max matches to return (ripgrep)." }
      }
    },
    annotations: { readOnlyHint: true, idempotentHint: true, module: skill.module, when: skill.when }
  };
}

// ── Minimal YAML frontmatter parser ──────────────────────────────────────────

function parseFrontmatter(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  const stack: Array<{ indent: number; value: Record<string, unknown> | unknown[] }> = [
    { indent: -1, value: root }
  ];

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^\s*/)![0].length;
    const line   = raw.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;

    if (line.startsWith("- ")) {
      if (Array.isArray(parent)) parent.push(parseScalar(line.slice(2)));
      continue;
    }
    const sep = line.indexOf(":");
    if (sep < 0) continue;
    const key = line.slice(0, sep).trim();
    const val = line.slice(sep + 1).trim();
    if (val === "") {
      const child: Record<string, unknown> = {};
      (parent as Record<string, unknown>)[key] = child;
      stack.push({ indent, value: child });
    } else {
      (parent as Record<string, unknown>)[key] = parseScalar(val);
    }
  }
  return root;
}

function parseScalar(v: string): unknown {
  if (v === "true")  return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function textContent(text: string): any {
  return { content: [{ type: "text", text }], isError: false };
}

function send(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
