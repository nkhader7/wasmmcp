"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpServerProcess = void 0;
const cp   = require("child_process");
const path = require("path");
const vscode = require("vscode");

class McpServerProcess {
  constructor(extensionRoot) {
    this.extensionRoot = extensionRoot;
    this.proc = null;
    this.channel = vscode.window.createOutputChannel("WASM MCP Server");
  }
  start() {
    if (this.proc) return;
    const serverEntry = path.resolve(this.extensionRoot, "../bin/wasmmcp.js");
    const node = process.execPath;
    this.channel.appendLine(`[mcp-server] Starting: ${node} ${serverEntry}`);
    this.proc = cp.spawn(node, [serverEntry], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } });
    this.proc.stdout?.on("data", (d) => this.channel.append(d.toString()));
    this.proc.stderr?.on("data", (d) => this.channel.append(`[stderr] ${d}`));
    this.proc.on("exit", (code) => {
      this.channel.appendLine(`[mcp-server] exited (code ${code})`);
      this.proc = null;
    });
  }
  stop() {
    if (!this.proc) return;
    this.proc.kill();
    this.proc = null;
    this.channel.appendLine("[mcp-server] stopped");
  }
  get isRunning() { return this.proc !== null; }
  showLog() { this.channel.show(); }
  mcpConfigSnippet() {
    const serverEntry = path.resolve(this.extensionRoot, "../bin/wasmmcp.js").replace(/\\/g, "/");
    return JSON.stringify({ wasmmcp: { type: "stdio", command: "node", args: [serverEntry] } }, null, 2);
  }
  dispose() { this.stop(); this.channel.dispose(); }
}
exports.McpServerProcess = McpServerProcess;
