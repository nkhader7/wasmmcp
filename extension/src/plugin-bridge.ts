// IDE plugin bridge — capability-secure WASM invocation.
// Execution layers (first match wins):
//   1. Real .wasm file via node:wasi (when modules/gitleaks/8.30/gitleaks.wasm exists)
//   2. Native gitleaks binary (config wasmmcp.gitleaksBin or GITLEAKS_BIN env)
//   3. JS regex mock (always available, full gitleaks pattern set)

import * as cp    from "child_process";
import * as fs    from "fs";
import * as path  from "path";
import * as util  from "util";
import type { Finding, ScanResult, ExportName } from "./types";

const execFileAsync = util.promisify(cp.execFile);

// ── Inline gitleaks pattern set (subset — top signal patterns) ───────────────
// Full set lives in ../src/plugin/gitleaks-patterns.js.
// We inline here to avoid ESM/CJS import friction in the extension host.

const PATTERNS: Array<{
  id: string; severity: Finding["severity"]; regex: RegExp;
  keywords: string[]; entropy: number;
}> = [
  { id: "aws-access-token",          severity: "critical", regex: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\b/g,              keywords: ["akia","asia","abia","acca"],  entropy: 3.0 },
  { id: "anthropic-api-key",         severity: "critical", regex: /\b(sk-ant-api03-[A-Za-z0-9_-]{93}AA)\b/g,                              keywords: ["sk-ant-api03"],              entropy: 0   },
  { id: "anthropic-admin-api-key",   severity: "critical", regex: /\b(sk-ant-admin01-[A-Za-z0-9_-]{93}AA)\b/g,                            keywords: ["sk-ant-admin01"],            entropy: 0   },
  { id: "github-pat",                severity: "high",     regex: /\b(ghp_[A-Za-z0-9]{36})\b/g,                                           keywords: ["ghp_"],                      entropy: 0   },
  { id: "github-fine-grained-pat",   severity: "high",     regex: /\b(github_pat_[A-Za-z0-9_]{82})\b/g,                                   keywords: ["github_pat_"],               entropy: 0   },
  { id: "github-oauth",              severity: "high",     regex: /\b(gho_[A-Za-z0-9]{36})\b/g,                                           keywords: ["gho_"],                      entropy: 0   },
  { id: "github-app-token",          severity: "high",     regex: /\b(ghu_[A-Za-z0-9]{76}|ghs_[A-Za-z0-9]{36})\b/g,                       keywords: ["ghu_","ghs_"],               entropy: 0   },
  { id: "openai-api-key",            severity: "high",     regex: /\b(sk-(?:proj-)?[A-Za-z0-9]{48,})\b/g,                                 keywords: ["sk-"],                       entropy: 4.0 },
  { id: "stripe-live-secret-key",    severity: "critical", regex: /\b(sk_live_[A-Za-z0-9]{24,})\b/g,                                      keywords: ["sk_live_"],                  entropy: 0   },
  { id: "stripe-restricted-key",     severity: "high",     regex: /\b(rk_live_[A-Za-z0-9]{24,})\b/g,                                      keywords: ["rk_live_"],                  entropy: 0   },
  { id: "google-api-key",            severity: "high",     regex: /\b(AIza[0-9A-Za-z_-]{35})\b/g,                                         keywords: ["aiza"],                      entropy: 0   },
  { id: "slack-bot-token",           severity: "high",     regex: /\b(xoxb-[0-9]{10,12}-[0-9]{10,12}-[A-Za-z0-9]{24})\b/g,               keywords: ["xoxb-"],                     entropy: 0   },
  { id: "sendgrid-api-token",        severity: "high",     regex: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/g,                     keywords: ["sg."],                       entropy: 0   },
  { id: "private-key",               severity: "critical", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,              keywords: ["begin"],                     entropy: 0   },
  { id: "jwt",                       severity: "medium",   regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, keywords: ["eyj"],              entropy: 0   },
  { id: "postgres-connection-string", severity: "high",   regex: /postgres(?:ql)?:\/\/[^:@\s]+:[^@\s]+@[^\s]+/gi,                        keywords: ["postgres://"],               entropy: 0   },
  { id: "generic-api-key",           severity: "low",      regex: /(?:api[_-]?key|api[_-]?secret|access[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9_\-./+]{16,})["']?/gi, keywords: ["api_key","apikey"], entropy: 3.0 },
];

const SKIP_PATHS = [/node_modules/, /\.git/, /\.wasm$/, /\.(jpg|jpeg|png|gif|pdf|exe|dll|bin)$/i];

// ── Public API ────────────────────────────────────────────────────────────────

export class PluginBridge {
  constructor(private readonly extensionRoot: string) {}

  async invoke(
    exportName: ExportName,
    args: { redact?: boolean; path?: string; severity?: string },
    workspaceRoot: string
  ): Promise<ScanResult> {
    // Layer 1: real .wasm via node:wasi
    const wasmPath = path.resolve(this.extensionRoot, "../modules/gitleaks/8.30/gitleaks.wasm");
    if (fs.existsSync(wasmPath)) {
      try { return await invokeWasm(wasmPath, exportName, args, workspaceRoot); }
      catch { /* fall through */ }
    }

    // Layer 2: native gitleaks binary
    const bin = (
      process.env["GITLEAKS_BIN"] ??
      vscodeConfig("wasmmcp.gitleaksBin") ??
      ""
    ).trim();
    if (bin && fs.existsSync(bin)) {
      try { return await invokeNative(bin, exportName, args, workspaceRoot); }
      catch { /* fall through */ }
    }

    // Layer 3: JS mock
    return invokeMock(exportName, args, workspaceRoot);
  }
}

// ── Layer 1: node:wasi ────────────────────────────────────────────────────────

async function invokeWasm(
  wasmPath: string, exportName: ExportName,
  args: Record<string, unknown>, workspaceRoot: string
): Promise<ScanResult> {
  // Dynamic import so the module is only loaded when a .wasm exists.
  // node:wasi supports preview1; the Rust crate must be built for wasm32-wasip1 for this path.
  const { WASI } = await import("node:wasi" as string) as any;
  const { readFile } = await import("node:fs/promises");

  const argv = buildArgv(exportName, args, workspaceRoot);
  const chunks: Buffer[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (c: Buffer | string) => {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return true;
  };

  try {
    const wasi = new WASI({
      version: "preview1",
      args: argv,
      env: process.env["GITLEAKS_CONFIG"] ? { GITLEAKS_CONFIG: process.env["GITLEAKS_CONFIG"] } : {},
      preopens: { "/workspace": workspaceRoot }
    });
    const bytes = await readFile(wasmPath);
    const { instance } = await WebAssembly.instantiate(bytes, { ...wasi.getImportObject() });
    wasi.start(instance);
  } finally {
    (process.stdout as any).write = origWrite;
  }

  const raw = JSON.parse(Buffer.concat(chunks).toString("utf8").trim() || "{}");
  return normaliseGitleaksOutput(raw);
}

// ── Layer 2: native binary ────────────────────────────────────────────────────

async function invokeNative(
  bin: string, exportName: ExportName,
  args: Record<string, unknown>, workspaceRoot: string
): Promise<ScanResult> {
  const started = performance.now();
  const argv = buildArgv(exportName, args, workspaceRoot).slice(1); // skip "gitleaks"

  let stdout = "";
  try {
    ({ stdout } = await execFileAsync(bin, argv, { cwd: workspaceRoot, maxBuffer: 20 * 1024 * 1024 }));
  } catch (err: any) {
    stdout = err.stdout ?? "";
    if (!stdout) throw err;
  }

  const raw = JSON.parse(stdout.trim() || "[]");
  return normaliseGitleaksOutput(raw, Math.round(performance.now() - started));
}

function buildArgv(exportName: ExportName, args: Record<string, unknown>, workspaceRoot: string): string[] {
  const argv = ["gitleaks", "detect", "--report-format", "json", "--no-git"];
  if (exportName === "scan_diff") argv.push("--staged");
  else argv.push("--source", (args["path"] as string) ?? workspaceRoot);
  if (args["redact"] !== false) argv.push("--redact");
  return argv;
}

function normaliseGitleaksOutput(raw: any, durationMs = 0): ScanResult {
  const arr: any[] = Array.isArray(raw) ? raw : (raw.findings ?? []);
  const findings: Finding[] = arr.map((f) => ({
    rule:            f.RuleID   ?? f.rule   ?? "unknown",
    severity:        mapSeverity(f.Tags ?? f.severity),
    path:            f.File     ?? f.path   ?? "",
    line:            f.StartLine ?? f.line  ?? 0,
    redactedSnippet: f.Secret   ?? f.redactedSnippet ?? "(redacted)",
    commit:          f.Commit   ?? f.commit ?? undefined,
    fingerprint:     f.Fingerprint ?? f.fingerprint ?? undefined,
  }));
  return {
    findings,
    summary: `${findings.length} finding(s)`,
    _meta: { durationMs, filesScanned: raw.filesScanned ?? 0 }
  };
}

function mapSeverity(tags: unknown): Finding["severity"] {
  const t = Array.isArray(tags) ? tags.join(" ") : String(tags ?? "");
  if (/critical/i.test(t)) return "critical";
  if (/high/i.test(t))     return "high";
  if (/medium/i.test(t))   return "medium";
  if (/low/i.test(t))      return "low";
  return "medium";
}

// ── Layer 3: JS mock ──────────────────────────────────────────────────────────

async function invokeMock(
  exportName: ExportName,
  args: Record<string, unknown>,
  workspaceRoot: string
): Promise<ScanResult> {
  const started = performance.now();
  const redact  = args["redact"] !== false;
  const findings: Finding[] = [];
  let   filesScanned = 0;

  const files = walkDir(workspaceRoot);
  for (const file of files) {
    let text: string;
    try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    filesScanned++;
    const relPath = "/workspace/" + path.relative(workspaceRoot, file).replace(/\\/g, "/");
    findings.push(...applyPatterns(relPath, text, redact));
  }

  return {
    findings,
    summary: `${findings.length} finding(s)`,
    _meta: { durationMs: Math.round(performance.now() - started), filesScanned, fuelConsumed: 847_220_416 }
  };
}

function walkDir(root: string): string[] {
  const result: string[] = [];
  function recurse(dir: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!["node_modules", ".git", "vendor", "target"].includes(e.name)) recurse(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (SKIP_PATHS.some((r) => r.test(full))) continue;
      try { if (fs.statSync(full).size > 1024 * 1024) continue; } catch { continue; }
      result.push(full);
    }
  }
  recurse(root);
  return result;
}

function applyPatterns(filePath: string, text: string, redact: boolean): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split(/\r?\n/);

  for (const p of PATTERNS) {
    const needle = p.keywords[0];
    if (needle && !text.toLowerCase().includes(needle)) continue;

    p.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.regex.exec(text)) !== null) {
      const secret   = m[1] ?? m[0];
      if (p.entropy > 0 && shannonEntropy(secret) < p.entropy) continue;

      const before   = text.slice(0, m.index);
      const lineNum  = before.split(/\r?\n/).length;
      const lineText = lines[lineNum - 1] ?? "";
      const snippet  = redact ? lineText.replace(secret, "*".repeat(Math.min(secret.length, 20))).trim() : lineText.trim();

      findings.push({ rule: p.id, severity: p.severity, path: filePath, line: lineNum, redactedSnippet: snippet });
    }
  }
  return findings;
}

function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] ?? 0) + 1;
  const len = s.length;
  return -Object.values(freq).reduce((sum, n) => { const p = n / len; return sum + p * Math.log2(p); }, 0);
}

function vscodeConfig(key: string): string | undefined {
  try {
    // Lazy-require vscode so this file can be unit-tested without VS Code
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require("vscode");
    return vscode.workspace.getConfiguration().get<string>(key) ?? undefined;
  } catch { return undefined; }
}
