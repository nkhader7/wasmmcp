"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode         = require("vscode");
const plugin_bridge  = require("./plugin-bridge");
const diagnostics_m  = require("./diagnostics");
const findings_view  = require("./findings-view");
const status_bar     = require("./status-bar");
const mcp_server     = require("./mcp-server");
const types_1        = require("./types");

let bridge, diagnostics, treeView, statusBar, mcpServer;

function activate(context) {
  bridge      = new plugin_bridge.PluginBridge(context.extensionPath);
  diagnostics = new diagnostics_m.DiagnosticsProvider();
  treeView    = new findings_view.FindingsViewProvider();
  statusBar   = new status_bar.StatusBar();
  mcpServer   = new mcp_server.McpServerProcess(context.extensionPath);

  const treeViewHandle = vscode.window.createTreeView("wasmmcp.findings", {
    treeDataProvider: treeView,
    showCollapseAll:  true
  });

  context.subscriptions.push(
    diagnostics, treeView, statusBar, mcpServer, treeViewHandle,

    vscode.commands.registerCommand("wasmmcp.scanSecrets", () =>
      runScan("scan_repo", "Scanning workspace for secrets…")
    ),
    vscode.commands.registerCommand("wasmmcp.scanDiff", () =>
      runScan("scan_diff", "Scanning staged changes…")
    ),
    vscode.commands.registerCommand("wasmmcp.clearFindings", () => {
      diagnostics.clear(); treeView.clear(); statusBar.idle();
      vscode.window.showInformationMessage("WASM MCP: findings cleared.");
    }),
    vscode.commands.registerCommand("wasmmcp.startMcpServer", () => {
      mcpServer.start();
      vscode.window.showInformationMessage(
        "WASM MCP server started. Add this to your MCP client config:",
        "Show config"
      ).then(choice => { if (choice === "Show config") showMcpConfig(); });
    }),

    vscode.workspace.onDidSaveTextDocument(() => {
      if (vscode.workspace.getConfiguration().get("wasmmcp.autoScanOnSave")) {
        runScan("scan_diff", "Auto-scanning staged changes…").catch(() => {});
      }
    })
  );

  if (vscode.workspace.getConfiguration().get("wasmmcp.mcpServerAutoStart")) {
    mcpServer.start();
  }
}
exports.activate = activate;

function deactivate() { mcpServer?.stop(); }
exports.deactivate = deactivate;

async function runScan(exportName, progressTitle) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) { vscode.window.showWarningMessage("WASM MCP: No workspace folder is open."); return; }

  statusBar.scanning();
  const redact    = vscode.workspace.getConfiguration().get("wasmmcp.redact", true);
  const threshold = vscode.workspace.getConfiguration().get("wasmmcp.severityThreshold", "low");

  let result;
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `WASM MCP: ${progressTitle}`, cancellable: false },
    async (progress) => {
      progress.report({ message: "invoking local WASM module…" });
      result = await bridge.invoke(exportName, { redact, path: workspaceRoot }, workspaceRoot);
    }
  );

  const findings      = result.findings;
  const criticalCount = findings.filter(f => f.severity === "critical").length;
  const threshRank    = types_1.SEVERITY_RANK[threshold] ?? types_1.SEVERITY_RANK.low;
  const shown         = findings.filter(f => (types_1.SEVERITY_RANK[f.severity] ?? 4) <= threshRank);

  diagnostics.update(findings, workspaceRoot);
  treeView.setFindings(findings, workspaceRoot);
  statusBar.update(findings.length, criticalCount);

  const { durationMs, filesScanned } = result._meta;
  const durText = durationMs   ? ` in ${durationMs} ms`       : "";
  const fsText  = filesScanned ? ` (${filesScanned} files)`   : "";

  if (findings.length === 0) {
    vscode.window.showInformationMessage(`WASM MCP: No secrets found${durText}${fsText}. ✓`);
  } else {
    const msg = `WASM MCP: ${findings.length} finding(s) — ${criticalCount} critical${durText}${fsText}`;
    const choice = await vscode.window.showWarningMessage(msg, "Show Findings", "Dismiss");
    if (choice === "Show Findings") vscode.commands.executeCommand("wasmmcp.findings.focus");
  }

  if (shown.length > 0) vscode.commands.executeCommand("wasmmcp.findings.focus");
}

function showMcpConfig() {
  const snippet = mcpServer.mcpConfigSnippet();
  vscode.workspace.openTextDocument({ language: "json", content: snippet })
    .then(doc => vscode.window.showTextDocument(doc));
  vscode.window.showInformationMessage(
    "Paste into ~/.claude/claude_desktop_config.json (Claude Code) or .windsurf/mcp.json (Windsurf)."
  );
}
