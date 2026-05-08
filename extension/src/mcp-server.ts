// Manages the MCP skill server (bin/wasmmcp.js) as a child process.
// VS Code MCP clients (Claude Code, Cursor, Windsurf) connect to this via stdio.

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

    const serverEntry = path.resolve(this.extensionRoot, "../bin/wasmmcp.js");
    const node = process.execPath; // same node binary that runs VS Code

    this.channel.appendLine(`[mcp-server] Starting: ${node} ${serverEntry}`);

    this.proc = cp.spawn(node, [serverEntry], {
      stdio: ["pipe", "pipe", "pipe"],
      env:   { ...process.env }
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

  /** Build the JSON snippet users paste into claude_desktop_config.json / .cursor/mcp.json */
  mcpConfigSnippet(): string {
    const serverEntry = path.resolve(this.extensionRoot, "../bin/wasmmcp.js").replace(/\\/g, "/");
    return JSON.stringify(
      {
        "wasmmcp": {
          "type": "stdio",
          "command": "node",
          "args": [serverEntry]
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
