"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;

const vscode     = require("vscode");
const path       = require("path");
const scanner    = require("./scanner");
const { GitleaksPanel }       = require("./panel");
const { GitleaksTreeProvider } = require("./tree-view");
const { GitleaksStatusBar }    = require("./status-bar");

// Shared diagnostics collection
let _diagCollection;
let _treeProvider;
let _statusBar;
let _extensionUri;
let _lastFindings = [];
let _scanning     = false;

function activate(context) {
  _extensionUri    = context.extensionUri;
  _diagCollection  = vscode.languages.createDiagnosticCollection("gitleaks-scanner-wasm");
  _treeProvider    = new GitleaksTreeProvider();
  _statusBar       = new GitleaksStatusBar();

  const treeView = vscode.window.createTreeView("gitleaksWasm.tree", {
    treeDataProvider: _treeProvider,
    showCollapseAll:  true
  });

  context.subscriptions.push(
    _diagCollection,
    _treeProvider,
    _statusBar,
    treeView,

    vscode.commands.registerCommand("gitleaksWasm.openPanel", () => {
      const panel = GitleaksPanel.createOrShow(_extensionUri);
      if (_lastFindings.length > 0) {
        panel.updateFindings(_lastFindings, _lastMeta);
      }
    }),

    vscode.commands.registerCommand("gitleaksWasm.scan", () => runScan()),

    vscode.commands.registerCommand("gitleaksWasm.scanFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { vscode.window.showWarningMessage("No active file to scan."); return; }
      await runFileScan(editor.document);
    }),

    vscode.commands.registerCommand("gitleaksWasm.clearResults", () => {
      _lastFindings = [];
      _lastMeta     = {};
      _diagCollection.clear();
      _treeProvider.clear();
      _statusBar.idle();
      GitleaksPanel.current?.updateFindings([], {});
      vscode.window.showInformationMessage("Gitleaks: findings cleared.");
    }),

    vscode.commands.registerCommand("gitleaksWasm.copyJson", () => {
      vscode.env.clipboard.writeText(JSON.stringify(_lastFindings, null, 2))
        .then(() => vscode.window.showInformationMessage(`Gitleaks: ${_lastFindings.length} findings copied to clipboard.`));
    })
  );

  if (vscode.workspace.getConfiguration().get("gitleaksWasm.autoScanOnOpen")) {
    runScan();
  }
}
exports.activate = activate;

function deactivate() {}
exports.deactivate = deactivate;

// ── Meta ──────────────────────────────────────────────────────────────────────
let _lastMeta = {};

// ── Full workspace scan ───────────────────────────────────────────────────────
async function runScan() {
  if (_scanning) return;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) { vscode.window.showWarningMessage("Gitleaks: No workspace folder open."); return; }

  _scanning = true;
  _statusBar.scanning();
  const panel = GitleaksPanel.current;
  panel?.setScanning(true);

  const redact = vscode.workspace.getConfiguration().get("gitleaksWasm.redact", true);

  try {
    let result;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Gitleaks WASM: Scanning workspace…", cancellable: false },
      async (progress) => {
        progress.report({ message: "starting…" });
        result = await scanner.scanWorkspace(root, {
          redact,
          onProgress: ({ message, progress: p, total }) => {
            progress.report({ message, increment: total > 0 ? Math.round(p / total * 100) : undefined });
            panel?.setProgress(message, p ?? 0, total ?? 0);
          }
        });
      }
    );

    _lastFindings = result.findings;
    _lastMeta     = { filesScanned: result.filesScanned, durationMs: result.durationMs };

    applyDiagnostics(result.findings, root);
    _treeProvider.setFindings(result.findings, root);
    updateStatusBar(result.findings);
    panel?.updateFindings(result.findings, _lastMeta);

    const { findings } = result;
    const crit = findings.filter(f => f.severity === "critical").length;
    const msg  = findings.length === 0
      ? `Gitleaks: No secrets found (${result.filesScanned} files, ${result.durationMs} ms). ✓`
      : `Gitleaks: ${findings.length} finding(s) — ${crit} critical`;

    if (findings.length === 0) {
      vscode.window.showInformationMessage(msg);
    } else {
      const choice = await vscode.window.showWarningMessage(msg, "Open Panel");
      if (choice === "Open Panel") {
        const p = GitleaksPanel.createOrShow(_extensionUri);
        p.updateFindings(findings, _lastMeta);
      }
    }

  } catch (err) {
    _statusBar.error(err.message);
    panel?.setError(err.message);
    vscode.window.showErrorMessage(`Gitleaks scan failed: ${err.message}`);
  } finally {
    _scanning = false;
    panel?.setScanning(false);
  }
}

// ── Single-file scan ──────────────────────────────────────────────────────────
async function runFileScan(doc) {
  const result = await scanner.scanText(doc.fileName, doc.getText(), {
    redact: vscode.workspace.getConfiguration().get("gitleaksWasm.redact", true)
  });

  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? path.dirname(doc.fileName);
  const rel  = path.relative(root, doc.fileName).replace(/\\/g, "/");

  // Map relative paths back
  const findings = result.findings.map(f => ({ ...f, path: rel }));
  const prev = _lastFindings.filter(f => f.path !== rel);
  _lastFindings = [...prev, ...findings];

  applyDiagnostics(_lastFindings, root);
  _treeProvider.setFindings(_lastFindings, root);
  updateStatusBar(_lastFindings);
  GitleaksPanel.current?.updateFindings(_lastFindings, _lastMeta);

  vscode.window.showInformationMessage(
    findings.length === 0
      ? `Gitleaks: No secrets in ${path.basename(doc.fileName)}. ✓`
      : `Gitleaks: ${findings.length} finding(s) in ${path.basename(doc.fileName)}`
  );
}

// ── Diagnostics ───────────────────────────────────────────────────────────────
const SEV_MAP = {
  critical: vscode.DiagnosticSeverity.Error,
  high:     vscode.DiagnosticSeverity.Error,
  medium:   vscode.DiagnosticSeverity.Warning,
  low:      vscode.DiagnosticSeverity.Information,
  info:     vscode.DiagnosticSeverity.Hint
};

function applyDiagnostics(findings, workspaceRoot) {
  _diagCollection.clear();
  const threshold = severityThreshold();
  const SEV_RANK = { critical:0, high:1, medium:2, low:3, info:4 };

  const byFile = new Map();
  for (const f of findings) {
    if ((SEV_RANK[f.severity] ?? 4) > threshold) continue;
    const abs = path.join(workspaceRoot, f.path);
    const arr = byFile.get(abs) ?? [];
    arr.push(f);
    byFile.set(abs, arr);
  }

  for (const [absPath, group] of byFile) {
    const uri   = vscode.Uri.file(absPath);
    const diags = group.map(f => {
      const line  = Math.max(0, f.line - 1);
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
      const diag  = new vscode.Diagnostic(
        range,
        `[${f.severity.toUpperCase()}] ${f.rule}${f.snippet ? " — " + f.snippet : ""}`,
        SEV_MAP[f.severity] ?? vscode.DiagnosticSeverity.Warning
      );
      diag.source = "Gitleaks WASM";
      diag.code   = { value: f.rule, target: vscode.Uri.parse("https://github.com/gitleaks/gitleaks") };
      return diag;
    });
    _diagCollection.set(uri, diags);
  }
}

function updateStatusBar(findings) {
  const bySev = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc; }, {});
  _statusBar.update(findings.length, bySev);
}

function severityThreshold() {
  const SEV_RANK = { critical:0, high:1, medium:2, low:3, all:4 };
  const cfg = vscode.workspace.getConfiguration().get("gitleaksWasm.severityFilter", "all");
  return SEV_RANK[cfg] ?? 4;
}
