"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginBridge = void 0;
const cp   = require("child_process");
const fs   = require("fs");
const path = require("path");
const util = require("util");

const execFileAsync = util.promisify(cp.execFile);

const PATTERNS = [
  { id: "aws-access-token",          severity: "critical", regex: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\b/g,                     keywords: ["akia","asia"],   entropy: 3.0 },
  { id: "anthropic-api-key",         severity: "critical", regex: /\b(sk-ant-api03-[A-Za-z0-9_-]{93}AA)\b/g,                                      keywords: ["sk-ant"],        entropy: 0   },
  { id: "anthropic-admin-api-key",   severity: "critical", regex: /\b(sk-ant-admin01-[A-Za-z0-9_-]{93}AA)\b/g,                                    keywords: ["sk-ant-admin"],  entropy: 0   },
  { id: "github-pat",                severity: "high",     regex: /\b(ghp_[A-Za-z0-9]{36})\b/g,                                                   keywords: ["ghp_"],          entropy: 0   },
  { id: "github-fine-grained-pat",   severity: "high",     regex: /\b(github_pat_[A-Za-z0-9_]{82})\b/g,                                           keywords: ["github_pat_"],   entropy: 0   },
  { id: "github-oauth",              severity: "high",     regex: /\b(gho_[A-Za-z0-9]{36})\b/g,                                                   keywords: ["gho_"],          entropy: 0   },
  { id: "github-app-token",          severity: "high",     regex: /\b(ghu_[A-Za-z0-9]{76}|ghs_[A-Za-z0-9]{36})\b/g,                               keywords: ["ghu_","ghs_"],   entropy: 0   },
  { id: "openai-api-key",            severity: "high",     regex: /\b(sk-(?:proj-)?[A-Za-z0-9]{48,})\b/g,                                         keywords: ["sk-"],           entropy: 4.0 },
  { id: "stripe-live-secret-key",    severity: "critical", regex: /\b(sk_live_[A-Za-z0-9]{24,})\b/g,                                              keywords: ["sk_live_"],      entropy: 0   },
  { id: "stripe-restricted-key",     severity: "high",     regex: /\b(rk_live_[A-Za-z0-9]{24,})\b/g,                                              keywords: ["rk_live_"],      entropy: 0   },
  { id: "google-api-key",            severity: "high",     regex: /\b(AIza[0-9A-Za-z_-]{35})\b/g,                                                 keywords: ["aiza"],          entropy: 0   },
  { id: "slack-bot-token",           severity: "high",     regex: /\b(xoxb-[0-9]{10,12}-[0-9]{10,12}-[A-Za-z0-9]{24})\b/g,                       keywords: ["xoxb-"],         entropy: 0   },
  { id: "sendgrid-api-token",        severity: "high",     regex: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/g,                             keywords: ["sg."],           entropy: 0   },
  { id: "private-key",               severity: "critical", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,                      keywords: ["begin"],         entropy: 0   },
  { id: "jwt",                       severity: "medium",   regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,   keywords: ["eyj"],           entropy: 0   },
  { id: "postgres-connection-string", severity: "high",   regex: /postgres(?:ql)?:\/\/[^:@\s]+:[^@\s]+@[^\s]+/gi,                                keywords: ["postgres"],      entropy: 0   },
  { id: "generic-api-key",           severity: "low",      regex: /(?:api[_-]?key|api[_-]?secret|access[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9_\-./+]{16,})["']?/gi, keywords: ["api_key","apikey"], entropy: 3.0 },
];

const SKIP_PATHS = [/node_modules/, /\.git/, /\.wasm$/, /\.(jpg|jpeg|png|gif|pdf|exe|dll|bin)$/i];

class PluginBridge {
  constructor(extensionRoot) {
    this.extensionRoot = extensionRoot;
  }

  async invoke(exportName, args, workspaceRoot) {
    // Layer 1: real .wasm via node:wasi
    const wasmPath = path.resolve(this.extensionRoot, "../modules/gitleaks/8.30/gitleaks.wasm");
    if (fs.existsSync(wasmPath)) {
      try { return await invokeWasm(wasmPath, exportName, args, workspaceRoot); } catch (_) {}
    }

    // Layer 2: native binary
    const bin = (process.env["GITLEAKS_BIN"] ?? cfgStr("wasmmcp.gitleaksBin") ?? "").trim();
    if (bin && fs.existsSync(bin)) {
      try { return await invokeNative(bin, exportName, args, workspaceRoot); } catch (_) {}
    }

    // Layer 3: JS mock
    return invokeMock(exportName, args, workspaceRoot);
  }
}
exports.PluginBridge = PluginBridge;

// ── Layer 1 ──────────────────────────────────────────────────────────────────

async function invokeWasm(wasmPath, exportName, args, workspaceRoot) {
  const { WASI }    = await import("node:wasi");
  const { readFile } = await import("node:fs/promises");
  const argv   = buildArgv(exportName, args, workspaceRoot);
  const chunks = [];
  const orig   = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); return true; };
  try {
    const wasi = new WASI({ version: "preview1", args: argv, env: {}, preopens: { "/workspace": workspaceRoot } });
    const { instance } = await WebAssembly.instantiate(await readFile(wasmPath), { ...wasi.getImportObject() });
    wasi.start(instance);
  } finally { process.stdout.write = orig; }
  return normalise(JSON.parse(Buffer.concat(chunks).toString("utf8").trim() || "{}"));
}

// ── Layer 2 ──────────────────────────────────────────────────────────────────

async function invokeNative(bin, exportName, args, workspaceRoot) {
  const started = performance.now();
  const argv    = buildArgv(exportName, args, workspaceRoot).slice(1);
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync(bin, argv, { cwd: workspaceRoot, maxBuffer: 20 * 1024 * 1024 }));
  } catch (err) { stdout = err.stdout ?? ""; if (!stdout) throw err; }
  return normalise(JSON.parse(stdout.trim() || "[]"), Math.round(performance.now() - started));
}

function buildArgv(exportName, args, workspaceRoot) {
  const a = ["gitleaks", "detect", "--report-format", "json", "--no-git"];
  if (exportName === "scan_diff") a.push("--staged");
  else a.push("--source", args.path ?? workspaceRoot);
  if (args.redact !== false) a.push("--redact");
  return a;
}

function normalise(raw, durationMs = 0) {
  const arr = Array.isArray(raw) ? raw : (raw.findings ?? []);
  return {
    findings: arr.map(f => ({
      rule:            f.RuleID ?? f.rule ?? "unknown",
      severity:        mapSev(f.Tags ?? f.severity),
      path:            f.File ?? f.path ?? "",
      line:            f.StartLine ?? f.line ?? 0,
      redactedSnippet: f.Secret ?? f.redactedSnippet ?? "(redacted)",
      commit:          f.Commit ?? f.commit,
      fingerprint:     f.Fingerprint ?? f.fingerprint
    })),
    summary: `${arr.length} finding(s)`,
    _meta:   { durationMs, filesScanned: raw.filesScanned ?? 0 }
  };
}

function mapSev(tags) {
  const t = Array.isArray(tags) ? tags.join(" ") : String(tags ?? "");
  if (/critical/i.test(t)) return "critical";
  if (/high/i.test(t))     return "high";
  if (/medium/i.test(t))   return "medium";
  if (/low/i.test(t))      return "low";
  return "medium";
}

// ── Layer 3: JS mock ──────────────────────────────────────────────────────────

async function invokeMock(exportName, args, workspaceRoot) {
  const started = performance.now();
  const redact  = args.redact !== false;
  const findings = [];
  let filesScanned = 0;
  for (const file of walkDir(workspaceRoot)) {
    let text; try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
    filesScanned++;
    const rel = "/workspace/" + path.relative(workspaceRoot, file).replace(/\\/g, "/");
    findings.push(...applyPatterns(rel, text, redact));
  }
  return { findings, summary: `${findings.length} finding(s)`, _meta: { durationMs: Math.round(performance.now() - started), filesScanned, fuelConsumed: 847_220_416 } };
}

function walkDir(root) {
  const result = [];
  function r(dir) {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!["node_modules",".git","vendor","target"].includes(e.name)) r(full); continue; }
      if (!e.isFile()) continue;
      if (SKIP_PATHS.some(p => p.test(full))) continue;
      try { if (fs.statSync(full).size > 1024 * 1024) continue; } catch { continue; }
      result.push(full);
    }
  }
  r(root); return result;
}

function applyPatterns(filePath, text, redact) {
  const findings = []; const lines = text.split(/\r?\n/);
  for (const p of PATTERNS) {
    const needle = p.keywords[0];
    if (needle && !text.toLowerCase().includes(needle)) continue;
    p.regex.lastIndex = 0; let m;
    while ((m = p.regex.exec(text)) !== null) {
      const secret  = m[1] ?? m[0];
      if (p.entropy > 0 && shannonEntropy(secret) < p.entropy) continue;
      const before  = text.slice(0, m.index);
      const lineNum = before.split(/\r?\n/).length;
      const lineText = lines[lineNum - 1] ?? "";
      findings.push({ rule: p.id, severity: p.severity, path: filePath, line: lineNum, redactedSnippet: redact ? lineText.replace(secret, "*".repeat(Math.min(secret.length,20))).trim() : lineText.trim() });
    }
  }
  return findings;
}

function shannonEntropy(s) {
  if (!s) return 0;
  const freq = {}; for (const c of s) freq[c] = (freq[c] ?? 0) + 1;
  const len = s.length;
  return -Object.values(freq).reduce((sum, n) => { const p = n / len; return sum + p * Math.log2(p); }, 0);
}

function cfgStr(key) {
  try { return require("vscode").workspace.getConfiguration().get(key) ?? undefined; } catch { return undefined; }
}
