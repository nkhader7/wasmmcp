import { readWorkspaceFiles } from "./workspace-reader.js";

const SECRET_PATTERNS = [
  { rule: "generic-api-key", severity: "high", regex: /\b(api[_-]?key|token|secret)\s*[:=]\s*["']?([A-Za-z0-9_\-]{16,})/gi },
  { rule: "aws-access-key", severity: "critical", regex: /\bAKIA[0-9A-Z]{16}\b/g }
];

export class WasmHost {
  async invoke({ module, exportName, args, invocation }) {
    if (module.name === "gitleaks" && exportName === "scan_repo") {
      return scanRepo(invocation.preopens[0].hostPath, args);
    }

    if (module.name === "ripgrep" && exportName === "grep") {
      return grepRepo(invocation.preopens[0].hostPath, args);
    }

    throw new Error(`No local mock for ${module.moduleRef}.${exportName}`);
  }
}

async function scanRepo(workspaceRoot, args) {
  const started = performance.now();
  const findings = [];

  for (const file of await readWorkspaceFiles(workspaceRoot)) {
    const lines = file.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        if (pattern.regex.test(lines[index])) {
          findings.push({
            rule: pattern.rule,
            severity: pattern.severity,
            path: file.path,
            line: index + 1,
            redactedSnippet: args.redact === false ? lines[index].trim() : redact(lines[index].trim())
          });
        }
      }
    }
  }

  return {
    summary: `${findings.length} potential secret finding(s)`,
    findings,
    _meta: {
      durationMs: Math.round(performance.now() - started),
      fuelConsumed: 847220416
    }
  };
}

async function grepRepo(workspaceRoot, args) {
  const query = String(args.query ?? "");
  const findings = [];
  if (!query) return { summary: "No query supplied", findings, _meta: { durationMs: 0, fuelConsumed: 0 } };

  for (const file of await readWorkspaceFiles(workspaceRoot)) {
    const lines = file.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].includes(query)) {
        findings.push({
          rule: "text-match",
          severity: "info",
          path: file.path,
          line: index + 1,
          redactedSnippet: lines[index].trim()
        });
      }
    }
  }

  return {
    summary: `${findings.length} text match(es)`,
    findings: findings.slice(0, Number(args.maxMatches ?? 1000)),
    _meta: { durationMs: 0, fuelConsumed: 1000 }
  };
}

function redact(value) {
  return value.replace(/[A-Za-z0-9_\-]{8,}/g, "[REDACTED]");
}
