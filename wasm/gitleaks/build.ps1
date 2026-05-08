#!/usr/bin/env pwsh
# Build gitleaks-wasm for wasm32-wasip2 and copy to the module registry.
# Run from: wasm/gitleaks/
#
# Prerequisites:
#   rustup target add wasm32-wasip2
#   cargo install wasm-tools   (optional — for component model wrapping)
#
# The resulting .wasm is a WASI CLI binary that the IDE plugin's wasmtime host
# can instantiate directly with wasm32-wasip2 support.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$TARGET  = "wasm32-wasip2"
$PROFILE = "release"
$OUT_DIR = "../../modules/gitleaks/8.30"

Write-Host "[1/3] Ensuring gitleaks.toml is present..."
$tomlSrc = $env:GITLEAKS_TOML
if (-not (Test-Path "gitleaks.toml") -and $tomlSrc -and (Test-Path $tomlSrc)) {
    Copy-Item $tomlSrc "gitleaks.toml"
    Write-Host "      Copied from configured GITLEAKS_TOML"
} elseif (-not (Test-Path "gitleaks.toml")) {
    Write-Error "gitleaks.toml not found. Place it in wasm/gitleaks or set GITLEAKS_TOML to its source path."
}

Write-Host "[2/3] Building gitleaks-wasm ($TARGET $PROFILE)..."
rustup target add $TARGET 2>$null
cargo build --target $TARGET --profile $PROFILE

$wasmSrc = "target/$TARGET/$PROFILE/gitleaks.wasm"
if (-not (Test-Path $wasmSrc)) {
    Write-Error "Build produced no .wasm at $wasmSrc"
}

Write-Host "[3/3] Copying to module registry..."
New-Item -ItemType Directory -Force -Path $OUT_DIR | Out-Null
Copy-Item $wasmSrc "$OUT_DIR/gitleaks.wasm" -Force

$size = (Get-Item "$OUT_DIR/gitleaks.wasm").Length / 1MB
Write-Host ""
Write-Host "Done. $OUT_DIR/gitleaks.wasm ($([math]::Round($size,1)) MB)"
Write-Host ""
Write-Host "Update modules/index.json sha256 with:"
Write-Host "  (Get-FileHash '$OUT_DIR/gitleaks.wasm' -Algorithm SHA256).Hash.ToLower()"
