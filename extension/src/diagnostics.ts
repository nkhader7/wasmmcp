import * as vscode from "vscode";
import type { Finding, Severity } from "./types";
import { SEVERITY_RANK } from "./types";

const DIAG_SEVERITY: Record<Severity, vscode.DiagnosticSeverity> = {
  critical: vscode.DiagnosticSeverity.Error,
  high:     vscode.DiagnosticSeverity.Error,
  medium:   vscode.DiagnosticSeverity.Warning,
  low:      vscode.DiagnosticSeverity.Information,
  info:     vscode.DiagnosticSeverity.Hint
};

export class DiagnosticsProvider implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection("wasmmcp");

  update(findings: Finding[], workspaceRoot: string): void {
    this.collection.clear();

    const threshold = this.severityThreshold();
    const relevant  = findings.filter((f) => SEVERITY_RANK[f.severity] <= threshold);

    // Group by file
    const byFile = new Map<string, Finding[]>();
    for (const f of relevant) {
      const absPath = toAbsPath(f.path, workspaceRoot);
      const arr     = byFile.get(absPath) ?? [];
      arr.push(f);
      byFile.set(absPath, arr);
    }

    for (const [absPath, group] of byFile) {
      const uri  = vscode.Uri.file(absPath);
      const diags: vscode.Diagnostic[] = group.map((f) => {
        const line  = Math.max(0, f.line - 1);
        const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
        const diag  = new vscode.Diagnostic(
          range,
          buildMessage(f),
          DIAG_SEVERITY[f.severity]
        );
        diag.source = "WASM MCP";
        diag.code   = { value: f.rule, target: vscode.Uri.parse(`https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml`) };
        if (f.commit) diag.relatedInformation = [
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(uri, range),
            `Introduced in commit ${f.commit.slice(0, 8)}`
          )
        ];
        return diag;
      });
      this.collection.set(uri, diags);
    }
  }

  clear(): void { this.collection.clear(); }

  dispose(): void { this.collection.dispose(); }

  private severityThreshold(): number {
    const cfg = vscode.workspace.getConfiguration().get<string>("wasmmcp.severityThreshold", "low");
    return SEVERITY_RANK[cfg as Severity] ?? SEVERITY_RANK.low;
  }
}

function buildMessage(f: Finding): string {
  const sev  = f.severity.toUpperCase();
  const snip = f.redactedSnippet ? ` — ${f.redactedSnippet}` : "";
  return `[${sev}] ${f.rule}${snip}`;
}

function toAbsPath(findingPath: string, workspaceRoot: string): string {
  // finding paths come as "/workspace/src/config.js" — strip the /workspace prefix
  const rel = findingPath.replace(/^\/workspace\//, "");
  return `${workspaceRoot}/${rel}`;
}
