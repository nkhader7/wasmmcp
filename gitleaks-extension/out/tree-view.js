"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitleaksTreeProvider = void 0;
const vscode = require("vscode");
const path   = require("path");

const SEV_RANK   = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const SEV_ICON   = { critical: "error", high: "warning", medium: "info", low: "circle-outline", info: "dash" };
const SEV_COLOR  = { critical: new vscode.ThemeColor("errorForeground"), high: new vscode.ThemeColor("editorWarning.foreground"), medium: new vscode.ThemeColor("editorInfo.foreground"), low: undefined };

// ── Tree nodes ────────────────────────────────────────────────────────────────

class SeverityGroupNode extends vscode.TreeItem {
  constructor(severity, count) {
    const labels = { critical: "Critical", high: "High", medium: "Medium", low: "Low / Info" };
    super(`${labels[severity] ?? severity}  (${count})`, vscode.TreeItemCollapsibleState.Expanded);
    this.severity     = severity;
    this.iconPath     = new vscode.ThemeIcon(SEV_ICON[severity] ?? "circle-outline", SEV_COLOR[severity]);
    this.contextValue = "gitleaksSeverityGroup";
  }
}

class FileNode extends vscode.TreeItem {
  constructor(filePath, workspaceRoot, children) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.Expanded);
    this.filePath     = filePath;
    this.children     = children;
    this.description  = path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
    this.resourceUri  = vscode.Uri.file(filePath);
    this.iconPath     = vscode.ThemeIcon.File;
    this.tooltip      = filePath;
    this.contextValue = "gitleaksFile";
  }
}

class FindingNode extends vscode.TreeItem {
  constructor(finding, workspaceRoot) {
    super(`${finding.rule}`, vscode.TreeItemCollapsibleState.None);
    this.finding     = finding;
    const absPath    = path.join(workspaceRoot, finding.path);
    const lineZero   = Math.max(0, finding.line - 1);
    this.description = `line ${finding.line}`;
    this.tooltip     = new vscode.MarkdownString(
      `**${finding.rule}** · ${finding.severity.toUpperCase()}\n\n` +
      `\`${finding.path}:${finding.line}\`\n\n` +
      (finding.snippet ? `> ${finding.snippet}` : "")
    );
    this.iconPath     = new vscode.ThemeIcon(SEV_ICON[finding.severity] ?? "dash", SEV_COLOR[finding.severity]);
    this.contextValue = "gitleaksFinding";
    this.command = {
      command: "vscode.open", title: "Go to finding",
      arguments: [vscode.Uri.file(absPath), { selection: new vscode.Range(lineZero, 0, lineZero, 999) }]
    };
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

class GitleaksTreeProvider {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
    this._findings      = [];
    this._workspaceRoot = "";
    this._filter        = "all";
  }

  setFindings(findings, workspaceRoot) {
    this._findings      = findings;
    this._workspaceRoot = workspaceRoot;
    this._emitter.fire(undefined);
  }

  setFilter(severity) {
    this._filter = severity;
    this._emitter.fire(undefined);
  }

  clear() {
    this._findings = [];
    this._emitter.fire(undefined);
  }

  getTreeItem(el) { return el; }

  getChildren(el) {
    if (el instanceof SeverityGroupNode) return this._fileNodesForSeverity(el.severity);
    if (el instanceof FileNode)          return el.children;
    if (el instanceof FindingNode)       return [];

    // Root: severity group nodes
    const visible = this._visibleFindings();
    const bySev   = new Map();
    for (const f of visible) {
      const bucket = ["critical","high"].includes(f.severity) ? f.severity : (f.severity === "medium" ? "medium" : "low");
      const arr = bySev.get(bucket) ?? []; arr.push(f); bySev.set(bucket, arr);
    }
    return ["critical","high","medium","low"]
      .filter(s => bySev.has(s))
      .map(s => new SeverityGroupNode(s, bySev.get(s).length));
  }

  _fileNodesForSeverity(severity) {
    const normSev = sev => ["critical","high"].includes(sev) ? sev : (sev === "medium" ? "medium" : "low");
    const group   = this._findings.filter(f => normSev(f.severity) === severity);
    const byFile  = new Map();
    for (const f of group) {
      const arr = byFile.get(f.path) ?? []; arr.push(f); byFile.set(f.path, arr);
    }
    return [...byFile.entries()].map(([rel, findings]) => {
      const abs      = path.join(this._workspaceRoot, rel);
      const children = findings
        .sort((a,b) => a.line - b.line)
        .map(f => new FindingNode(f, this._workspaceRoot));
      return new FileNode(abs, this._workspaceRoot, children);
    });
  }

  _visibleFindings() {
    if (this._filter === "all") return this._findings;
    const rank = SEV_RANK[this._filter] ?? 4;
    return this._findings.filter(f => (SEV_RANK[f.severity] ?? 4) <= rank);
  }

  dispose() { this._emitter.dispose(); }
}
exports.GitleaksTreeProvider = GitleaksTreeProvider;

function sev(s) { return s; }
