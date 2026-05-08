"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusBar = void 0;
const vscode = require("vscode");

class StatusBar {
  constructor() {
    this.item = vscode.window.createStatusBarItem("wasmmcp.status", vscode.StatusBarAlignment.Left, 100);
    this.item.name    = "WASM MCP";
    this.item.command = "wasmmcp.scanSecrets";
    this.idle();
    this.item.show();
  }
  idle() {
    this.item.text            = "$(shield) WASM MCP";
    this.item.tooltip         = "Click to scan workspace for secrets";
    this.item.color           = undefined;
    this.item.backgroundColor = undefined;
  }
  scanning() {
    this.item.text    = "$(sync~spin) Scanning…";
    this.item.tooltip = "WASM MCP is scanning the workspace";
  }
  update(findingCount, criticalCount = 0) {
    if (findingCount === 0) {
      this.item.text            = "$(shield-check) 0 secrets";
      this.item.tooltip         = "No secrets found";
      this.item.color           = new vscode.ThemeColor("statusBarItem.prominentForeground");
      this.item.backgroundColor = undefined;
    } else if (criticalCount > 0) {
      this.item.text            = `$(error) ${findingCount} secret(s)`;
      this.item.tooltip         = `${criticalCount} critical / ${findingCount} total — click to scan again`;
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    } else {
      this.item.text            = `$(warning) ${findingCount} secret(s)`;
      this.item.tooltip         = `${findingCount} finding(s) — click to scan again`;
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
  }
  dispose() { this.item.dispose(); }
}
exports.StatusBar = StatusBar;
