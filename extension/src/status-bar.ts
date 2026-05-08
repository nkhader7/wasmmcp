import * as vscode from "vscode";

export class StatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      "wasmmcp.status",
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.name    = "WASM MCP";
    this.item.command = "wasmmcp.scanSecrets";
    this.idle();
    this.item.show();
  }

  idle(): void {
    this.item.text        = "$(shield) WASM MCP";
    this.item.tooltip     = "Click to scan workspace for secrets";
    this.item.color       = undefined;
    this.item.backgroundColor = undefined;
  }

  scanning(): void {
    this.item.text    = "$(sync~spin) Scanning…";
    this.item.tooltip = "WASM MCP is scanning the workspace";
  }

  update(findingCount: number, criticalCount = 0): void {
    if (findingCount === 0) {
      this.item.text             = "$(shield-check) 0 secrets";
      this.item.tooltip          = "No secrets found";
      this.item.color            = new vscode.ThemeColor("statusBarItem.prominentForeground");
      this.item.backgroundColor  = undefined;
    } else if (criticalCount > 0) {
      this.item.text             = `$(error) ${findingCount} secret(s)`;
      this.item.tooltip          = `${criticalCount} critical / ${findingCount} total — click to scan again`;
      this.item.backgroundColor  = new vscode.ThemeColor("statusBarItem.errorBackground");
    } else {
      this.item.text             = `$(warning) ${findingCount} secret(s)`;
      this.item.tooltip          = `${findingCount} finding(s) — click to scan again`;
      this.item.backgroundColor  = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
  }

  dispose(): void { this.item.dispose(); }
}
