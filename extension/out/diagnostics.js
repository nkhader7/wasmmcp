"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticsProvider = void 0;
const vscode = require("vscode");
const types_1 = require("./types");

const DIAG_SEVERITY = {
  critical: vscode.DiagnosticSeverity.Error,
  high:     vscode.DiagnosticSeverity.Error,
  medium:   vscode.DiagnosticSeverity.Warning,
  low:      vscode.DiagnosticSeverity.Information,
  info:     vscode.DiagnosticSeverity.Hint
};

class DiagnosticsProvider {
  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection("wasmmcp");
  }
  update(findings, workspaceRoot) {
    this.collection.clear();
    const threshold = this._threshold();
    const relevant  = findings.filter(f => (types_1.SEVERITY_RANK[f.severity] ?? 4) <= threshold);
    const byFile    = new Map();
    for (const f of relevant) {
      const abs = toAbsPath(f.path, workspaceRoot);
      const arr = byFile.get(abs) ?? [];
      arr.push(f);
      byFile.set(abs, arr);
    }
    for (const [absPath, group] of byFile) {
      const uri   = vscode.Uri.file(absPath);
      const diags = group.map(f => {
        const line  = Math.max(0, f.line - 1);
        const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
        const diag  = new vscode.Diagnostic(range, `[${f.severity.toUpperCase()}] ${f.rule}${f.redactedSnippet ? " — " + f.redactedSnippet : ""}`, DIAG_SEVERITY[f.severity]);
        diag.source = "WASM MCP";
        diag.code   = { value: f.rule, target: vscode.Uri.parse("https://github.com/gitleaks/gitleaks") };
        return diag;
      });
      this.collection.set(uri, diags);
    }
  }
  clear()   { this.collection.clear(); }
  dispose() { this.collection.dispose(); }
  _threshold() {
    const cfg = vscode.workspace.getConfiguration().get("wasmmcp.severityThreshold", "low");
    return types_1.SEVERITY_RANK[cfg] ?? types_1.SEVERITY_RANK.low;
  }
}
exports.DiagnosticsProvider = DiagnosticsProvider;

function toAbsPath(findingPath, workspaceRoot) {
  return `${workspaceRoot}/${findingPath.replace(/^\/workspace\//, "")}`;
}
