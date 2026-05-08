#!/usr/bin/env pwsh
# Build and package the WASM MCP VS Code extension to a .vsix file.
# Run from: extension/
#
# Prerequisites: Node.js >= 20
# The out/ directory already contains pre-compiled JS — no tsc required.
# If you modify src/*.ts, run: npx tsc -p ./

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[1/3] Installing @vscode/vsce..."
npm install --save-dev "@vscode/vsce" 2>&1 | Out-Null

Write-Host "[2/3] Packaging extension..."
npx vsce package --no-dependencies --out wasmmcp-vscode.vsix

$vsix = Get-Item "wasmmcp-vscode.vsix"
Write-Host ""
Write-Host "[3/3] Done: $($vsix.FullName) ($([math]::Round($vsix.Length/1KB, 0)) KB)"
Write-Host ""
Write-Host "Install in VS Code / Windsurf / Cursor:"
Write-Host "  Ctrl+Shift+P → 'Extensions: Install from VSIX…' → select wasmmcp-vscode.vsix"
Write-Host ""
Write-Host "Or from the command line:"
Write-Host "  code --install-extension wasmmcp-vscode.vsix"
Write-Host "  windsurf --install-extension wasmmcp-vscode.vsix"
