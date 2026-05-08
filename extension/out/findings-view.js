"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindingsViewProvider = void 0;
const vscode = require("vscode");
const path   = require("path");
const types_1 = require("./types");

class FileNode extends vscode.TreeItem {
  constructor(absPath, findings) {
    super(path.basename(absPath), vscode.TreeItemCollapsibleState.Expanded);
    this.absPath  = absPath;
    this.findings = findings;
    this.description  = path.dirname(absPath).split(path.sep).slice(-2).join("/");
    this.resourceUri  = vscode.Uri.file(absPath);
    this.iconPath     = vscode.ThemeIcon.File;
    this.tooltip      = absPath;
    this.contextValue = "wasmmcpFile";
  }
}

class FindingNode extends vscode.TreeItem {
  constructor(finding, workspaceRoot) {
    const icons = { critical: "$(error)", high: "$(warning)", medium: "$(info)", low: "$(circle-outline)", info: "$(dash)" };
    super(`${icons[finding.severity] ?? "$(dash)"} ${finding.rule}`, vscode.TreeItemCollapsibleState.None);
    this.finding      = finding;
    this.description  = `line ${finding.line}`;
    this.tooltip      = finding.redactedSnippet ?? finding.rule;
    this.iconPath     = new vscode.ThemeIcon({ critical:"error", high:"warning", medium:"info", low:"circle-outline", info:"dash" }[finding.severity]);
    this.contextValue = "wasmmcpFinding";
    const absPath = `${workspaceRoot}/${finding.path.replace(/^\/workspace\//, "")}`;
    const line    = Math.max(0, finding.line - 1);
    this.command  = { command: "vscode.open", title: "Open file", arguments: [vscode.Uri.file(absPath), { selection: new vscode.Range(line, 0, line, 0) }] };
  }
}

class FindingsViewProvider {
  constructor() {
    this.emitter       = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
    this.findings      = [];
    this.workspaceRoot = "";
  }
  setFindings(findings, workspaceRoot) {
    this.findings = [...findings].sort((a, b) => {
      const sd = (types_1.SEVERITY_RANK[a.severity] ?? 4) - (types_1.SEVERITY_RANK[b.severity] ?? 4);
      return sd !== 0 ? sd : a.path.localeCompare(b.path) || a.line - b.line;
    });
    this.workspaceRoot = workspaceRoot;
    this.emitter.fire(undefined);
  }
  clear() { this.findings = []; this.emitter.fire(undefined); }
  getTreeItem(element) { return element; }
  getChildren(element) {
    if (element instanceof FileNode)    return element.findings;
    if (element instanceof FindingNode) return [];
    const byFile = new Map();
    for (const f of this.findings) {
      const arr = byFile.get(f.path) ?? [];
      arr.push(f);
      byFile.set(f.path, arr);
    }
    return [...byFile.entries()].map(([fp, group]) => {
      const abs = `${this.workspaceRoot}/${fp.replace(/^\/workspace\//, "")}`;
      return new FileNode(abs, group.map(f => new FindingNode(f, this.workspaceRoot)));
    });
  }
  dispose() { this.emitter.dispose(); }
}
exports.FindingsViewProvider = FindingsViewProvider;
