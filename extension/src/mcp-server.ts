// Manages the embedded MCP host (out/mcp-host.js) as a child process.
// The host uses PluginBridge to run scans locally — no code sent to MCP server,
// no downloads, workspace bytes stay on this machine.
// Cascade (Windsurf) connects to the host via .windsurf/mcp.json.

import * as cp   from "child_process";
import * as path from "path";
import * as vscode from "vscode";

export class McpServerProcess implements vscode.Disposable {
  private proc: cp.ChildProcess | null = null;
  private readonly channel: vscode.OutputChannel;

  constructor(private readonly extensionRoot: string) {
    this.channel = vscode.window.createOutputChannel("WASM MCP Server");
  }

  start(): void {
    if (this.proc) return; // already running

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const serverEntry   = path.resolve(this.extensionRoot, "out/mcp-host.js");
    const node          = process.execPath; // same Node.js that runs VS Code

    this.channel.appendLine(`[mcp-host] Starting: ${node} ${serverEntry}`);
    this.channel.appendLine(`[mcp-host] Workspace: ${workspaceRoot}`);

    this.proc = cp.spawn(node, [serverEntry], {
      stdio: ["pipe", "pipe", "pipe"],
      env:   { ...process.env, WORKSPACE_ROOT: workspaceRoot }
    });

    this.proc.stdout?.on("data", (d: Buffer) => this.channel.append(d.toString()));
    this.proc.stderr?.on("data", (d: Buffer) => this.channel.append(`[stderr] ${d}`));
    this.proc.on("exit", (code) => {
      this.channel.appendLine(`[mcp-server] exited (code ${code})`);
      this.proc = null;
    });
  }

  stop(): void {
    if (!this.proc) return;
    this.proc.kill();
    this.proc = null;
    this.channel.appendLine("[mcp-server] stopped");
  }

  get isRunning(): boolean { return this.proc !== null; }

  showLog(): void { this.channel.show(); }

  /** Build the JSON snippet users paste into .windsurf/mcp.json, .cursor/mcp.json, or claude_desktop_config.json */
  mcpConfigSnippet(): string {
    const hostEntry     = path.resolve(this.extensionRoot, "out/mcp-host.js").replace(/\\/g, "/");
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath?.replace(/\\/g, "/") ?? ".";
    return JSON.stringify(
      {
        "wasmmcp": {
          "type":    "stdio",
          "command": "node",
          "args":    [hostEntry],
          "env":     { "WORKSPACE_ROOT": workspaceRoot }
        }
      },
      null, 2
    );
  }

  dispose(): void {
    this.stop();
    this.channel.dispose();
  }
}
