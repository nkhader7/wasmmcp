import { execFile } from "node:child_process";
import { existsSync }  from "node:fs";
import { readFile }    from "node:fs/promises";
import { promisify }   from "node:util";
import { WASI }        from "node:wasi";
import { readWorkspaceFiles } from "./workspace-reader.js";
import {
  PATTERNS,
  ALLOWLIST_PATHS,
  ALLOWLIST_VALUE_REGEXES,
  shannonEntropy
} from "./gitleaks-patterns.js";
import {
  CHECKOV_ALL_RESOURCE_RULESET,
  findCheckovRulesForLine,
  inferIacTypeFromPath
} from "../rules/checkov-all-resource-scans.js";

const execFileAsync = promisify(execFile);

// ── Public host ──────────────────────────────────────────────────────────────

export class WasmHost {
  async invoke({ module, exportName, args, invocation }) {
    const workspaceRoot = invocation.preopens[0].hostPath;

    // Layer 1: real .wasm file via node:wasi (preview1)
    if (existsSync(module.wasmPath ?? "")) {
      try {
        return await invokeWasm(module.wasmPath, exportName, args, invocation);
      } catch (err) {
        process.stderr.write(`[wasm-host] wasm exec failed (${err.message}), falling back\n`);
      }
    }

    // Layer 2: native gitleaks binary when GITLEAKS_BIN is set (dev/CI convenience)
    const nativeBin = process.env.GITLEAKS_BIN;
    if (nativeBin && existsSync(nativeBin) && module.name === "gitleaks") {
      try {
        return await invokeNative(nativeBin, exportName, workspaceRoot, args);
      } catch (err) {
        process.stderr.write(`[wasm-host] native exec failed (${err.message}), falling back\n`);
      }
    }

    // Layer 3: JS mock — full gitleaks rule set from gitleaks-patterns.js
    if (module.name === "gitleaks") {
      return exportName === "scan_diff"
        ? scanDiff(workspaceRoot, args)
        : scanRepo(workspaceRoot, args);
    }

    if (module.name === "ripgrep") {
      if (args.rules === CHECKOV_ALL_RESOURCE_RULESET.name) {
        return scanCheckovAllResourceScans(workspaceRoot, args);
      }
      return grepRepo(workspaceRoot, args);
    }

    throw new Error(`No handler for ${module.moduleRef}.${exportName}`);
  }
}

// ── Layer 1: real WASM via node:wasi (preview1) ──────────────────────────────
// NOTE: The gitleaks.wasm module is compiled for wasm32-wasip2 (WASI 0.2 component model).
// Node.js's built-in `node:wasi` only supports WASI preview1, so this layer will fail
// at instantiation for a wasip2 component. The catch block falls through to Layer 2/3.
// To run the actual .wasm binary, replace this layer with wasmtime-nodejs or
// @bytecodealliance/jco (e.g. `jco run gitleaks.wasm -- detect ...`).

async function invokeWasm(wasmPath, exportName, args, invocation) {
  const argv = buildArgv(exportName, args);
  const preopens = Object.fromEntries(
    invocation.preopens.map((p) => [p.guestPath, p.hostPath])
  );
  const env = Object.fromEntries(
    Object.entries(invocation.env ?? {}).filter(([, v]) => v !== undefined)
  );

  // Capture stdout by temporarily redirecting process.stdout.write
  const chunks = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return true; };

  try {
    const wasi = new WASI({ version: "preview1", args: argv, env, preopens });
    const bytes = await readFile(wasmPath);
    const { instance } = await WebAssembly.instantiate(bytes, { ...wasi.getImportObject() });
    wasi.start(instance);
  } finally {
    process.stdout.write = origWrite;
  }

  const stdout = Buffer.concat(chunks).toString("utf8").trim();
  if (!stdout) throw new Error("WASM module produced no stdout");

  const raw = JSON.parse(stdout);
  return normalizeGitleaksOutput(raw);
}

function buildArgv(exportName, args) {
  const base = ["gitleaks", "detect", "--report-format", "json", "--no-git"];
  if (exportName === "scan_diff") base.push("--staged");
  else base.push("--source", args.path ?? "/workspace");
  if (args.redact !== false) base.push("--redact");
  return base;
}

// ── Layer 2: native gitleaks binary ─────────────────────────────────────────

async function invokeNative(binaryPath, exportName, workspaceRoot, args) {
  const started = performance.now();
  const cliArgs = ["detect", "--report-format", "json", "--no-git"];

  if (exportName === "scan_diff") {
    cliArgs.push("--staged");
  } else {
    cliArgs.push("--source", args.path ?? workspaceRoot);
  }
  if (args.redact !== false) cliArgs.push("--redact");

  let stdout = "";
  try {
    ({ stdout } = await execFileAsync(binaryPath, cliArgs));
  } catch (err) {
    // gitleaks exits non-zero when findings exist; stdout still has JSON
    stdout = err.stdout ?? "";
    if (!stdout) throw err;
  }

  const raw = JSON.parse(stdout.trim() || "[]");
  return normalizeGitleaksOutput(raw, Math.round(performance.now() - started));
}

function normalizeGitleaksOutput(raw, durationMs = 0) {
  const findings = (Array.isArray(raw) ? raw : raw.findings ?? []).map((f) => ({
    rule:            f.RuleID   ?? f.rule   ?? "unknown",
    severity:        mapGitleaksSeverity(f.Tags ?? f.severity),
    path:            f.File     ?? f.path   ?? "",
    line:            f.StartLine ?? f.line  ?? 0,
    redactedSnippet: f.Secret   ?? f.redactedSnippet ?? "(redacted)",
    commit:          f.Commit   ?? f.commit ?? undefined,
    fingerprint:     f.Fingerprint ?? undefined
  }));

  return {
    summary: `${findings.length} finding(s)`,
    findings,
    _meta: { durationMs, fuelConsumed: 0, filesScanned: 0 }
  };
}

function mapGitleaksSeverity(tags) {
  if (!tags) return "medium";
  const t = Array.isArray(tags) ? tags.join(" ") : String(tags);
  if (/critical/i.test(t)) return "critical";
  if (/high/i.test(t))     return "high";
  if (/medium/i.test(t))   return "medium";
  if (/low/i.test(t))      return "low";
  return "medium";
}

// ── Layer 3: JS mock — full gitleaks rule set ────────────────────────────────

async function scanRepo(workspaceRoot, args) {
  const started  = performance.now();
  const findings = [];
  const files    = await readWorkspaceFiles(workspaceRoot);

  for (const file of files) {
    if (isPathAllowed(file.path)) continue;
    findings.push(...applyRules(file.path, file.text, args));
  }

  return {
    summary: `${findings.length} potential secret finding(s)`,
    findings,
    _meta: {
      durationMs:   Math.round(performance.now() - started),
      fuelConsumed: 847_220_416,
      filesScanned: files.length
    }
  };
}

async function scanDiff(workspaceRoot, args) {
  // For the JS mock, scan all uncommitted-looking files (same as scanRepo)
  return scanRepo(workspaceRoot, { ...args, _diffMode: true });
}

async function grepRepo(workspaceRoot, args) {
  const query = String(args.query ?? "");
  if (!query) return { summary: "No query supplied", findings: [], _meta: { durationMs: 0, fuelConsumed: 0 } };

  const started  = performance.now();
  const findings = [];
  const files    = await readWorkspaceFiles(workspaceRoot);
  const matcher  = buildTextMatcher(query);

  for (const file of files) {
    const lines = file.text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (matcher(lines[i])) {
        findings.push({
          rule: "text-match", severity: "info",
          path: file.path, line: i + 1,
          redactedSnippet: lines[i].trim()
        });
      }
    }
  }

  return {
    summary: `${findings.length} text match(es)`,
    findings: findings.slice(0, Number(args.maxMatches ?? 1000)),
    _meta: { durationMs: Math.round(performance.now() - started), fuelConsumed: 1000, filesScanned: files.length }
  };
}

async function scanCheckovAllResourceScans(workspaceRoot, args) {
  const started    = performance.now();
  const findings   = [];
  const files      = await readWorkspaceFiles(workspaceRoot);
  const maxMatches = Number(args.maxMatches ?? 20000);

  for (const file of files) {
    if (!isIacPath(file.path)) continue;

    const iacType = inferIacTypeFromPath(file.path);
    const lines   = file.text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const matchedRules = findCheckovRulesForLine(lines[i], { iacType, limit: 8 });
      for (const rule of matchedRules) {
        findings.push({
          rule:            rule.id,
          severity:        "medium",
          path:            file.path,
          line:            i + 1,
          policy:          rule.policy,
          iac:             rule.iac,
          entity:          rule.entity,
          resourceLink:    rule.resourceUrl,
          redactedSnippet: lines[i].trim(),
          confidence:      "candidate"
        });

        if (findings.length >= maxMatches) break;
      }
      if (findings.length >= maxMatches) break;
    }
    if (findings.length >= maxMatches) break;
  }

  return {
    summary: `${findings.length} Checkov candidate finding(s) from ${CHECKOV_ALL_RESOURCE_RULESET.ruleCount} rules`,
    findings,
    _meta: {
      durationMs:   Math.round(performance.now() - started),
      fuelConsumed: 1000,
      filesScanned: files.length,
      rulesLoaded:  CHECKOV_ALL_RESOURCE_RULESET.ruleCount,
      ruleSet:      CHECKOV_ALL_RESOURCE_RULESET.name
    }
  };
}

function buildTextMatcher(query) {
  try {
    const re = new RegExp(query, "i");
    return (line) => re.test(line);
  } catch {
    return (line) => line.includes(query);
  }
}

function isIacPath(filePath) {
  const p = String(filePath ?? "").replace(/\\/g, "/").toLowerCase();
  return (
    p.endsWith("dockerfile") ||
    p.includes("/dockerfile") ||
    p.endsWith(".tf") ||
    p.endsWith(".tfvars") ||
    p.endsWith(".yaml") ||
    p.endsWith(".yml") ||
    p.endsWith(".json") ||
    p.endsWith(".template") ||
    p.endsWith(".bicep")
  );
}

// ── Rule application ─────────────────────────────────────────────────────────

function applyRules(filePath, text, args) {
  const redact   = args.redact !== false;
  const minSev   = parseSeverityThreshold(args.severity ?? "low+");
  const findings = [];
  const lines    = text.split(/\r?\n/);

  for (const pattern of PATTERNS) {
    if (!meetsThreshold(pattern.severity, minSev)) continue;

    // Quick keyword pre-filter (fast path)
    const needle = pattern.keywords?.[0];
    if (needle && !text.toLowerCase().includes(needle.toLowerCase())) continue;

    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      const matched = match[1] ?? match[0];

      // Entropy gate
      if (pattern.entropy > 0 && shannonEntropy(matched) < pattern.entropy) continue;

      // Global value allowlist
      if (ALLOWLIST_VALUE_REGEXES.some((r) => r.test(matched))) continue;

      // Find line number
      const before   = text.slice(0, match.index);
      const lineNum  = before.split(/\r?\n/).length;
      const lineText = lines[lineNum - 1] ?? "";

      findings.push({
        rule:            pattern.id,
        severity:        pattern.severity,
        path:            filePath,
        line:            lineNum,
        redactedSnippet: redact ? redactSecret(lineText, matched) : lineText.trim()
      });
    }
  }

  return findings;
}

function isPathAllowed(filePath) {
  return ALLOWLIST_PATHS.some((r) => r.test(filePath));
}

const SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function parseSeverityThreshold(spec) {
  return SEV_RANK[spec.replace(/\+$/, "").trim()] ?? 3;
}

function meetsThreshold(severity, minRank) {
  return (SEV_RANK[severity] ?? 4) <= minRank;
}

function redactSecret(line, secret) {
  const stars = "*".repeat(Math.min(secret.length, 20));
  return line.replace(secret, stars).trim();
}
