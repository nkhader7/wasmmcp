import * as vscode from "vscode";
import { PluginBridge }         from "./plugin-bridge";
import { DiagnosticsProvider }  from "./diagnostics";
import { FindingsViewProvider }  from "./findings-view";
import { StatusBar }             from "./status-bar";
import { McpServerProcess }      from "./mcp-server";
import { SEVERITY_RANK }         from "./types";
import type { Finding }          from "./types";

let bridge:      PluginBridge;
let diagnostics: DiagnosticsProvider;
let treeView:    FindingsViewProvider;
let statusBar:   StatusBar;
let mcpServer:   McpServerProcess;

export function activate(context: vscode.ExtensionContext): void {
  bridge      = new PluginBridge(context.extensionPath);
  diagnostics = new DiagnosticsProvider();
  treeView    = new FindingsViewProvider();
  statusBar   = new StatusBar();
  mcpServer   = new McpServerProcess(context.extensionPath);

  // Register the Security Findings tree view
  const treeViewHandle = vscode.window.createTreeView("wasmmcp.findings", {
    treeDataProvider: treeView,
    showCollapseAll:  true
  });

  context.subscriptions.push(
    diagnostics,
    treeView,
    statusBar,
    mcpServer,
    treeViewHandle,

    vscode.commands.registerCommand("wasmmcp.scanSecrets", () =>
      runScan("scan_repo", "Scanning workspace for secrets…")
    ),
    vscode.commands.registerCommand("wasmmcp.scanDiff", () =>
      runScan("scan_diff", "Scanning staged changes…")
    ),
    vscode.commands.registerCommand("wasmmcp.clearFindings", () => {
      diagnostics.clear();
      treeView.clear();
      statusBar.idle();
      vscode.window.showInformationMessage("WASM MCP: findings cleared.");
    }),
    vscode.commands.registerCommand("wasmmcp.startMcpServer", () => {
      mcpServer.start();
      vscode.window.showInformationMessage(
        "WASM MCP server started. Add this to your MCP client config:",
        "Show config"
      ).then((choice) => {
        if (choice === "Show config") showMcpConfig();
      });
    })
  );

  // Auto-scan on save (if enabled)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      if (vscode.workspace.getConfiguration().get<boolean>("wasmmcp.autoScanOnSave")) {
        runScan("scan_diff", "Auto-scanning staged changes…").catch(() => undefined);
      }
    })
  );

  // Auto-start MCP server (if enabled)
  if (vscode.workspace.getConfiguration().get<boolean>("wasmmcp.mcpServerAutoStart")) {
    mcpServer.start();
  }
}

export function deactivate(): void {
  mcpServer?.stop();
}

// ── Scan runner ───────────────────────────────────────────────────────────────

async function runScan(
  exportName: "scan_repo" | "scan_diff",
  progressTitle: string
): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage("WASM MCP: No workspace folder is open.");
    return;
  }

  statusBar.scanning();

  const redact    = vscode.workspace.getConfiguration().get<boolean>("wasmmcp.redact", true);
  const threshold = vscode.workspace.getConfiguration().get<string>("wasmmcp.severityThreshold", "low");

  let result: Awaited<ReturnType<typeof bridge.invoke>>;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `WASM MCP: ${progressTitle}`, cancellable: false },
    async (progress) => {
      progress.report({ message: "invoking local WASM module…" });
      result = await bridge.invoke(exportName, { redact, path: workspaceRoot }, workspaceRoot);
      progress.report({ message: "rendering findings…" });
    }
  );

  const findings      = result!.findings;
  const criticalCount = findings.filter((f: Finding) => f.severity === "critical").length;
  const threshRank    = SEVERITY_RANK[threshold as keyof typeof SEVERITY_RANK] ?? SEVERITY_RANK.low;
  const shown         = findings.filter((f: Finding) => SEVERITY_RANK[f.severity] <= threshRank);

  diagnostics.update(findings, workspaceRoot);
  treeView.setFindings(findings, workspaceRoot);
  statusBar.update(findings.length, criticalCount);

  const meta    = result!._meta;
  const durText = meta.durationMs ? ` in ${meta.durationMs} ms` : "";
  const fsText  = meta.filesScanned ? ` (${meta.filesScanned} files)` : "";

  if (findings.length === 0) {
    vscode.window.showInformationMessage(`WASM MCP: No secrets found${durText}${fsText}. ✓`);
  } else {
    const msg = `WASM MCP: ${findings.length} finding(s) — ${criticalCount} critical${durText}${fsText}`;
    const choice = await vscode.window.showWarningMessage(msg, "Show Findings", "Dismiss");
    if (choice === "Show Findings") {
      await vscode.commands.executeCommand("wasmmcp.findings.focus");
    }
  }

  if (shown.length > 0) {
    void vscode.commands.executeCommand("wasmmcp.findings.focus");
  }
}

// ── MCP config helper ─────────────────────────────────────────────────────────

function showMcpConfig(): void {
  const snippet = mcpServer.mcpConfigSnippet();
  vscode.workspace.openTextDocument({ language: "json", content: snippet }).then((doc) => {
    vscode.window.showTextDocument(doc);
  });
  vscode.window.showInformationMessage(
    "Paste this into ~/.claude/claude_desktop_config.json (Claude Code) or .cursor/mcp.json (Cursor)."
  );
}
