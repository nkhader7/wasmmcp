import * as vscode from "vscode";
import * as path   from "path";
import type { Finding, Severity } from "./types";
import { SEVERITY_RANK } from "./types";

const SEV_ICON: Record<Severity, string> = {
  critical: "$(error)",
  high:     "$(warning)",
  medium:   "$(info)",
  low:      "$(circle-outline)",
  info:     "$(dash)"
};

// ── Tree nodes ────────────────────────────────────────────────────────────────

type TreeNode = FileNode | FindingNode;

class FileNode extends vscode.TreeItem {
  constructor(
    public readonly absPath: string,
    public readonly findings: FindingNode[]
  ) {
    super(path.basename(absPath), vscode.TreeItemCollapsibleState.Expanded);
    this.description  = path.dirname(absPath).split(path.sep).slice(-2).join("/");
    this.resourceUri  = vscode.Uri.file(absPath);
    this.iconPath     = vscode.ThemeIcon.File;
    this.tooltip      = absPath;
    this.contextValue = "wasmmcpFile";
  }
}

class FindingNode extends vscode.TreeItem {
  constructor(public readonly finding: Finding, workspaceRoot: string) {
    super(`${SEV_ICON[finding.severity]} ${finding.rule}`, vscode.TreeItemCollapsibleState.None);
    this.description  = `line ${finding.line}`;
    this.tooltip      = finding.redactedSnippet ?? finding.rule;
    this.iconPath     = new vscode.ThemeIcon(iconName(finding.severity));
    this.contextValue = "wasmmcpFinding";

    const absPath = toAbsPath(finding.path, workspaceRoot);
    const line    = Math.max(0, finding.line - 1);
    this.command  = {
      command:   "vscode.open",
      title:     "Open file",
      arguments: [
        vscode.Uri.file(absPath),
        { selection: new vscode.Range(line, 0, line, 0) } as vscode.TextDocumentShowOptions
      ]
    };
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class FindingsViewProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  private findings:      Finding[] = [];
  private workspaceRoot: string    = "";

  setFindings(findings: Finding[], workspaceRoot: string): void {
    // Sort: critical first, then by file + line
    this.findings = [...findings].sort((a, b) => {
      const sd = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      return sd !== 0 ? sd : a.path.localeCompare(b.path) || a.line - b.line;
    });
    this.workspaceRoot = workspaceRoot;
    this.emitter.fire(undefined);
  }

  clear(): void {
    this.findings = [];
    this.emitter.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem { return element; }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element instanceof FileNode)    return element.findings;
    if (element instanceof FindingNode) return [];

    // Root: group findings by file
    const byFile = new Map<string, Finding[]>();
    for (const f of this.findings) {
      const key = f.path;
      const arr = byFile.get(key) ?? [];
      arr.push(f);
      byFile.set(key, arr);
    }

    const nodes: FileNode[] = [];
    for (const [filePath, group] of byFile) {
      const absPath = toAbsPath(filePath, this.workspaceRoot);
      const children = group.map((f) => new FindingNode(f, this.workspaceRoot));
      nodes.push(new FileNode(absPath, children));
    }
    return nodes;
  }

  dispose(): void { this.emitter.dispose(); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function iconName(sev: Severity): string {
  return { critical: "error", high: "warning", medium: "info", low: "circle-outline", info: "dash" }[sev];
}

function toAbsPath(findingPath: string, workspaceRoot: string): string {
  const rel = findingPath.replace(/^\/workspace\//, "");
  return `${workspaceRoot}/${rel}`;
}
