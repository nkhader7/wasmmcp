#!/usr/bin/env pwsh
# Packages the Gitleaks Scanner WASM extension to a .vsix file.
# Run from: gitleaks-extension/
#
# Prerequisites: Node.js >= 20

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "[1/2] Installing @vscode/vsce..."
npm install --save-dev "@vscode/vsce" 2>&1 | Out-Null

Write-Host "[2/2] Packaging..."
npx vsce package --no-dependencies --out gitleaks-scanner-wasm.vsix

$vsix = Get-Item "gitleaks-scanner-wasm.vsix"
Write-Host ""
Write-Host "Done: $($vsix.Name)  ($([math]::Round($vsix.Length/1KB,0)) KB)"
Write-Host ""
Write-Host "Install in VS Code / Windsurf / Cursor:"
Write-Host "  Ctrl+Shift+P → 'Extensions: Install from VSIX…'"
Write-Host "  windsurf --install-extension gitleaks-scanner-wasm.vsix"
Write-Host "  code     --install-extension gitleaks-scanner-wasm.vsix"
