"use strict";
// Gitleaks invocation — three layers:
//   1. gitleaks.wasm via node:wasi (when built)
//   2. native gitleaks binary (GITLEAKS_BIN env / gitleaksWasm.gitleaksBin setting)
//   3. JS regex mock (always available — full pattern set from gitleaks.toml)
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanWorkspace = exports.scanText = void 0;

const cp   = require("child_process");
const fs   = require("fs");
const path = require("path");
const util = require("util");

const execFileAsync = util.promisify(cp.execFile);

// ── Pattern set (derived from gitleaks.toml v8.30) ──────────────────────────
const PATTERNS = [
  { id: "aws-access-token",          severity: "critical", regex: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16})\b/g,                      keywords: ["akia","asia","abia","acca"], entropy: 3.0 },
  { id: "anthropic-api-key",         severity: "critical", regex: /\b(sk-ant-api03-[A-Za-z0-9_-]{93}AA)\b/g,                                       keywords: ["sk-ant-api03"],             entropy: 0   },
  { id: "anthropic-admin-api-key",   severity: "critical", regex: /\b(sk-ant-admin01-[A-Za-z0-9_-]{93}AA)\b/g,                                     keywords: ["sk-ant-admin01"],           entropy: 0   },
  { id: "github-pat",                severity: "high",     regex: /\b(ghp_[A-Za-z0-9]{36})\b/g,                                                    keywords: ["ghp_"],                     entropy: 0   },
  { id: "github-fine-grained-pat",   severity: "high",     regex: /\b(github_pat_[A-Za-z0-9_]{82})\b/g,                                            keywords: ["github_pat_"],              entropy: 0   },
  { id: "github-oauth",              severity: "high",     regex: /\b(gho_[A-Za-z0-9]{36})\b/g,                                                    keywords: ["gho_"],                     entropy: 0   },
  { id: "github-app-token",          severity: "high",     regex: /\b(ghu_[A-Za-z0-9]{76}|ghs_[A-Za-z0-9]{36})\b/g,                                keywords: ["ghu_","ghs_"],              entropy: 0   },
  { id: "openai-api-key",            severity: "high",     regex: /\b(sk-(?:proj-)?[A-Za-z0-9]{48,})\b/g,                                          keywords: ["sk-"],                      entropy: 4.0 },
  { id: "stripe-live-secret-key",    severity: "critical", regex: /\b(sk_live_[A-Za-z0-9]{24,})\b/g,                                               keywords: ["sk_live_"],                 entropy: 0   },
  { id: "stripe-restricted-key",     severity: "high",     regex: /\b(rk_live_[A-Za-z0-9]{24,})\b/g,                                               keywords: ["rk_live_"],                 entropy: 0   },
  { id: "google-api-key",            severity: "high",     regex: /\b(AIza[0-9A-Za-z_-]{35})\b/g,                                                  keywords: ["aiza"],                     entropy: 0   },
  { id: "google-oauth-token",        severity: "high",     regex: /\b(ya29\.[A-Za-z0-9_-]{20,})\b/g,                                               keywords: ["ya29."],                    entropy: 0   },
  { id: "slack-bot-token",           severity: "high",     regex: /\b(xoxb-[0-9]{10,12}-[0-9]{10,12}-[A-Za-z0-9]{24})\b/g,                        keywords: ["xoxb-"],                    entropy: 0   },
  { id: "slack-user-token",          severity: "high",     regex: /\b(xoxp-[0-9]{10,12}-[0-9]{10,12}-[0-9]{10,12}-[A-Za-z0-9]{32})\b/g,           keywords: ["xoxp-"],                    entropy: 0   },
  { id: "sendgrid-api-token",        severity: "high",     regex: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/g,                              keywords: ["sg."],                      entropy: 0   },
  { id: "alibaba-access-key-id",     severity: "high",     regex: /\b(LTAI[A-Za-z0-9]{20})\b/g,                                                    keywords: ["ltai"],                     entropy: 2.0 },
  { id: "azure-ad-client-secret",    severity: "high",     regex: /(?:^|[\s>=:(,])([A-Za-z0-9_~.]{3}\dQ~[A-Za-z0-9_~.-]{31,34})(?:$|[\s<),])/gm,  keywords: ["q~"],                       entropy: 3.0 },
  { id: "private-key",               severity: "critical", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,                       keywords: ["begin"],                    entropy: 0   },
  { id: "jwt",                       severity: "medium",   regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,    keywords: ["eyj"],                      entropy: 0   },
  { id: "postgres-url",              severity: "high",     regex: /postgres(?:ql)?:\/\/[^:@\s]+:[^@\s]+@[^\s]+/gi,                                 keywords: ["postgres://"],              entropy: 0   },
  { id: "mysql-url",                 severity: "high",     regex: /mysql:\/\/[^:@\s]+:[^@\s]+@[^\s]+/gi,                                           keywords: ["mysql://"],                 entropy: 0   },
  { id: "twilio-account-sid",        severity: "medium",   regex: /\b(AC[a-z0-9]{32})\b/g,                                                         keywords: ["ac"],                       entropy: 3.5 },
  { id: "airtable-pat",              severity: "medium",   regex: /\b(pat[A-Za-z0-9]{14}\.[a-f0-9]{64})\b/g,                                       keywords: ["airtable","pat"],           entropy: 0   },
  { id: "cloudflare-api-key",        severity: "high",     regex: /(?:cloudflare)[\s\S]{0,30}?(?:=|:|=>)\s*["']?([a-z0-9_-]{40})["']?/gi,         keywords: ["cloudflare"],               entropy: 2.0 },
  { id: "generic-api-key",           severity: "low",      regex: /(?:api[_-]?key|api[_-]?secret|access[_-]?token)\s*[:=]\s*["']?([A-Za-z0-9_\-.+/]{16,})["']?/gi, keywords: ["api_key","apikey","api-key"], entropy: 3.0 },
  { id: "generic-secret",            severity: "low",      regex: /(?:password|passwd|secret|credential)\s*[:=]\s*["']([^"'\s]{8,})["']/gi,        keywords: ["password","secret"],        entropy: 3.5 },
];

const SKIP_PATHS = [
  /node_modules[/\\]/, /\.git[/\\]/, /\.wasm$/,
  /\.(jpg|jpeg|png|gif|svg|ico|pdf|exe|dll|so|bin|pyc)$/i,
  /(package-lock|yarn\.lock|pnpm-lock)\.ya?ml?$/i
];

const ALLOWLIST_VALUES = [
  /^(?:true|false|null|undefined)$/i,
  /^\$\{?[A-Z_a-z]+\}?$/,
  /^\{\{[\w .|]+\}\}$/,
  /^%[A-Z_]+%$/
];

// ── Public API ───────────────────────────────────────────────────────────────

async function scanWorkspace(workspaceRoot, options = {}) {
  const { redact = true, onProgress } = options;

  // Layer 1: real .wasm
  const wasmPath = findWasm(workspaceRoot);
  if (wasmPath) {
    try { return await runWasm(wasmPath, workspaceRoot, redact, onProgress); }
    catch (e) { console.error("[gitleaks-wasm] wasm failed:", e.message); }
  }

  // Layer 2: native binary
  const bin = cfg("gitleaksWasm.gitleaksBin") || process.env.GITLEAKS_BIN || "";
  if (bin.trim() && fs.existsSync(bin.trim())) {
    try { return await runNative(bin.trim(), workspaceRoot, redact, onProgress); }
    catch (e) { console.error("[gitleaks-wasm] native failed:", e.message); }
  }

  // Layer 3: JS mock
  return runMock(workspaceRoot, redact, onProgress);
}
exports.scanWorkspace = scanWorkspace;

async function scanText(filePath, text, options = {}) {
  const { redact = true } = options;
  const started = performance.now();
  const rel = path.basename(filePath);
  const findings = applyPatterns(rel, text, redact);
  return { findings, filesScanned: 1, durationMs: Math.round(performance.now() - started) };
}
exports.scanText = scanText;

// ── Layer 1: node:wasi ───────────────────────────────────────────────────────

async function runWasm(wasmPath, root, redact, onProgress) {
  const { WASI }    = await import("node:wasi");
  const { readFile } = await import("node:fs/promises");
  const argv = ["gitleaks", "detect", "--source", root, "--report-format", "json", "--no-git"];
  if (redact) argv.push("--redact");

  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); return true; };
  try {
    const wasi = new WASI({ version: "preview1", args: argv, env: {}, preopens: { [root]: root } });
    const bytes = await readFile(wasmPath);
    const { instance } = await WebAssembly.instantiate(bytes, { ...wasi.getImportObject() });
    wasi.start(instance);
  } finally { process.stdout.write = orig; }

  const raw = JSON.parse(Buffer.concat(chunks).toString("utf8").trim() || "[]");
  return normalise(raw);
}

// ── Layer 2: native binary ───────────────────────────────────────────────────

async function runNative(bin, root, redact, onProgress) {
  const started = performance.now();
  onProgress?.({ message: `Running gitleaks binary…` });
  const argv = ["detect", "--source", root, "--report-format", "json", "--no-git"];
  if (redact) argv.push("--redact");

  let stdout = "";
  try {
    ({ stdout } = await execFileAsync(bin, argv, { cwd: root, maxBuffer: 20 * 1024 * 1024 }));
  } catch (err) {
    stdout = err.stdout ?? "";
    if (!stdout) throw err;
  }

  const raw = JSON.parse(stdout.trim() || "[]");
  return { ...normalise(raw), durationMs: Math.round(performance.now() - started) };
}

// ── Layer 3: JS mock ─────────────────────────────────────────────────────────

async function runMock(root, redact, onProgress) {
  const started  = performance.now();
  const files    = walkDir(root);
  const findings = [];
  let   done     = 0;

  for (const file of files) {
    let text; try { text = fs.readFileSync(file, "utf8"); } catch { done++; continue; }
    const rel = path.relative(root, file).replace(/\\/g, "/");
    findings.push(...applyPatterns(rel, text, redact));
    done++;
    if (onProgress && done % 50 === 0) {
      onProgress({ message: `Scanned ${done} / ${files.length} files…`, progress: done, total: files.length });
    }
  }

  return { findings, filesScanned: files.length, durationMs: Math.round(performance.now() - started) };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalise(raw) {
  const arr = Array.isArray(raw) ? raw : (raw.findings ?? []);
  return {
    findings: arr.map(f => ({
      rule:    f.RuleID   ?? f.rule   ?? "unknown",
      severity:mapSev(f.Tags ?? f.severity),
      path:    f.File     ?? f.path   ?? "",
      line:    f.StartLine ?? f.line  ?? 0,
      snippet: f.Secret   ?? f.redactedSnippet ?? "(redacted)",
      commit:  f.Commit   ?? f.commit ?? null,
      fingerprint: f.Fingerprint ?? null
    })),
    filesScanned: 0,
    durationMs:   0
  };
}

function mapSev(t) {
  const s = (Array.isArray(t) ? t.join(" ") : String(t ?? "")).toLowerCase();
  if (s.includes("critical")) return "critical";
  if (s.includes("high"))     return "high";
  if (s.includes("medium"))   return "medium";
  if (s.includes("low"))      return "low";
  return "medium";
}

function applyPatterns(relPath, text, redact) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (const p of PATTERNS) {
    const kw = p.keywords[0];
    if (kw && !text.toLowerCase().includes(kw)) continue;
    p.regex.lastIndex = 0;
    let m;
    while ((m = p.regex.exec(text)) !== null) {
      const secret = m[1] ?? m[0];
      if (p.entropy > 0 && shannonEntropy(secret) < p.entropy) continue;
      if (ALLOWLIST_VALUES.some(r => r.test(secret))) continue;
      const lineNum  = text.slice(0, m.index).split(/\r?\n/).length;
      const lineText = lines[lineNum - 1] ?? "";
      findings.push({
        rule: p.id, severity: p.severity, path: relPath, line: lineNum,
        snippet: redact ? lineText.replace(secret, "★".repeat(Math.min(secret.length, 20))).trim() : lineText.trim(),
        commit: null, fingerprint: `${relPath}:${p.id}:${lineNum}`
      });
    }
  }
  return findings;
}

function walkDir(root) {
  const result = [];
  function r(dir) {
    let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (!["node_modules",".git","vendor","target","dist","build",".next","out"].includes(e.name)) r(full);
        continue;
      }
      if (!e.isFile()) continue;
      if (SKIP_PATHS.some(rx => rx.test(full))) continue;
      try { if (fs.statSync(full).size > 512 * 1024) continue; } catch { continue; }
      result.push(full);
    }
  }
  r(root); return result;
}

function shannonEntropy(s) {
  if (!s) return 0;
  const freq = {}; for (const c of s) freq[c] = (freq[c] ?? 0) + 1;
  const len = s.length;
  return -Object.values(freq).reduce((sum, n) => { const p = n / len; return sum + p * Math.log2(p); }, 0);
}

function findWasm(root) {
  const candidates = [
    path.resolve(root, "../modules/gitleaks/8.30/gitleaks.wasm"),
    path.resolve(__dirname, "../../modules/gitleaks/8.30/gitleaks.wasm")
  ];
  return candidates.find(p => fs.existsSync(p)) ?? null;
}

function cfg(key) {
  try { return require("vscode").workspace.getConfiguration().get(key) ?? ""; }
  catch { return ""; }
}
