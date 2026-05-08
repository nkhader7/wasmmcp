// Task 5: Render findings as MCP structured content for LLM consumption.
// Input: raw ScanResult from wasm-host.
// Output: MCP tools/call result shape with text summary + resource URI.

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SEVERITY_ICON  = { critical: "🔴", high: "▲", medium: "●", low: "○", info: "·" };

export function renderFindings(scanResult, { progressToken, workspaceRoot } = {}) {
  const { findings = [], _meta = {} } = scanResult;

  const sorted = [...findings].sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
  );

  const counts = countBySeverity(sorted);
  const summary = buildSummaryLine(sorted, counts, _meta);
  const table   = buildFindingsTable(sorted);
  const hint    = buildFollowUpHint(sorted);

  const textContent = [summary, table, hint].filter(Boolean).join("\n\n");

  const content = [
    { type: "text", text: textContent }
  ];

  // Attach a resource pointer so the LLM can reference the full findings JSON
  if (sorted.length > 0) {
    const token = progressToken ?? "scan-" + Math.random().toString(36).slice(2, 8);
    content.push({
      type: "resource",
      resource: {
        uri: `mcp://findings/${token}/findings.json`,
        mimeType: "application/json",
        text: JSON.stringify({ findings: sorted, _meta }, null, 2)
      }
    });
  }

  return {
    content,
    isError: false,
    _meta: {
      durationMs:    _meta.durationMs    ?? 0,
      fuelConsumed:  _meta.fuelConsumed  ?? 0,
      filesScanned:  _meta.filesScanned  ?? 0,
      findingCount:  sorted.length,
      bySeverity:    counts
    }
  };
}

function countBySeverity(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

function buildSummaryLine(findings, counts, meta) {
  if (findings.length === 0) {
    const scanned = meta.filesScanned ? ` (${meta.filesScanned} files scanned)` : "";
    return `No secrets found${scanned}. ✓`;
  }

  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([sev, n]) => `${n} ${sev}`);

  const duration = meta.durationMs ? ` in ${meta.durationMs} ms` : "";
  const scanned  = meta.filesScanned ? `, ${meta.filesScanned} files scanned` : "";

  return `Found **${findings.length} secret finding(s)** (${parts.join(" · ")})${duration}${scanned}.`;
}

function buildFindingsTable(findings) {
  if (findings.length === 0) return "";

  const rows = findings.map((f) => {
    const icon    = SEVERITY_ICON[f.severity] ?? "·";
    const sev     = `${icon} ${f.severity.toUpperCase()}`;
    const loc     = f.commit ? `${f.path}:${f.line} · commit ${f.commit.slice(0, 8)}` : `${f.path}:${f.line}`;
    const snippet = f.redactedSnippet ? truncate(f.redactedSnippet, 60) : "(redacted)";
    return `| ${sev} | \`${f.rule}\` | \`${loc}\` | ${snippet} |`;
  });

  return [
    "| Severity | Rule | Location | Snippet |",
    "|---|---|---|---|",
    ...rows
  ].join("\n");
}

function buildFollowUpHint(findings) {
  if (findings.length === 0) return "";

  const hasCritical = findings.some((f) => f.severity === "critical");
  const hasHigh     = findings.some((f) => f.severity === "high");
  const hasGitItem  = findings.some((f) => f.commit);

  const options = [];
  if (hasCritical || hasHigh) options.push("(a) draft a credential rotation checklist");
  if (hasGitItem)             options.push("(b) rewrite git history to remove the committed secret");
  options.push("(c) add a `gitleaks:allow` annotation to suppress a false positive");
  options.push("(d) move secrets to `.env` and update `.gitignore`");

  return `Want me to: ${options.join(", ")}?`;
}

function truncate(str, max) {
  return str.length <= max ? str : str.slice(0, max - 1) + "…";
}
