"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitleaksStatusBar = void 0;
const vscode = require("vscode");

class GitleaksStatusBar {
  constructor() {
    this.item = vscode.window.createStatusBarItem("gitleaksWasm.status", vscode.StatusBarAlignment.Left, 99);
    this.item.name    = "Gitleaks Scanner";
    this.item.command = "gitleaksWasm.openPanel";
    this.idle();
    this.item.show();
  }
  idle() {
    this.item.text            = "$(shield) Gitleaks";
    this.item.tooltip         = "Gitleaks Scanner WASM — click to open panel";
    this.item.color           = undefined;
    this.item.backgroundColor = undefined;
  }
  scanning() {
    this.item.text            = "$(sync~spin) Scanning…";
    this.item.tooltip         = "Gitleaks is scanning the workspace";
    this.item.backgroundColor = undefined;
  }
  update(total, bySeverity) {
    const crit = bySeverity.critical ?? 0;
    const high = bySeverity.high     ?? 0;
    if (total === 0) {
      this.item.text            = "$(shield-check) 0 secrets";
      this.item.tooltip         = "Gitleaks: No secrets found — click to open panel";
      this.item.backgroundColor = undefined;
      this.item.color           = new vscode.ThemeColor("statusBar.foreground");
    } else if (crit > 0) {
      this.item.text            = `$(error) ${total} secret${total > 1 ? "s" : ""}`;
      this.item.tooltip         = `Gitleaks: ${crit} critical, ${high} high — click to open panel`;
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
      this.item.color           = undefined;
    } else if (high > 0) {
      this.item.text            = `$(warning) ${total} secret${total > 1 ? "s" : ""}`;
      this.item.tooltip         = `Gitleaks: ${high} high severity — click to open panel`;
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      this.item.color           = undefined;
    } else {
      this.item.text            = `$(info) ${total} finding${total > 1 ? "s" : ""}`;
      this.item.tooltip         = `Gitleaks: ${total} low/medium findings — click to open panel`;
      this.item.backgroundColor = undefined;
      this.item.color           = undefined;
    }
  }
  error(msg) {
    this.item.text            = "$(error) Gitleaks error";
    this.item.tooltip         = `Gitleaks: ${msg}`;
    this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
  }
  dispose() { this.item.dispose(); }
}
exports.GitleaksStatusBar = GitleaksStatusBar;
