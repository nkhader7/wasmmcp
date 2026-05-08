#!/usr/bin/env pwsh
# Builds gitleaks-scanner-wasm.vsix without Node.js.
# A .vsix is a ZIP with two XML manifest files + the extension folder.
# Run from: gitleaks-extension\

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$EXT_DIR   = $PSScriptRoot
$STAGE_DIR = Join-Path $env:TEMP "vsix-stage-$(Get-Random)"
$OUT_FILE  = Join-Path $EXT_DIR "gitleaks-scanner-wasm.vsix"

Write-Host "[1/4] Creating staging area..."
Remove-Item $STAGE_DIR -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$STAGE_DIR\extension\out" | Out-Null

Write-Host "[2/4] Copying extension files..."
Copy-Item "$EXT_DIR\package.json"       "$STAGE_DIR\extension\package.json"
Copy-Item "$EXT_DIR\out\extension.js"  "$STAGE_DIR\extension\out\extension.js"
Copy-Item "$EXT_DIR\out\panel.js"      "$STAGE_DIR\extension\out\panel.js"
Copy-Item "$EXT_DIR\out\scanner.js"    "$STAGE_DIR\extension\out\scanner.js"
Copy-Item "$EXT_DIR\out\status-bar.js" "$STAGE_DIR\extension\out\status-bar.js"
Copy-Item "$EXT_DIR\out\tree-view.js"  "$STAGE_DIR\extension\out\tree-view.js"

Write-Host "[3/4] Writing VSIX manifests..."

# Use WriteAllText for PS 5.1 compatibility (Set-Content -Encoding UTF8 has issues with piped here-strings)
$contentTypes = @'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="vsixmanifest" ContentType="text/xml"/>
  <Default Extension="json"         ContentType="application/json"/>
  <Default Extension="js"           ContentType="application/javascript"/>
  <Default Extension="md"           ContentType="text/markdown"/>
  <Default Extension="txt"          ContentType="text/plain"/>
  <Default Extension="ps1"          ContentType="text/plain"/>
</Types>
'@
[System.IO.File]::WriteAllText("$STAGE_DIR\[Content_Types].xml", $contentTypes, [System.Text.Encoding]::UTF8)

$vsixManifest = @'
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0"
  xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"
  xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US"
              Id="gitleaks-scanner-wasm"
              Version="1.0.0"
              Publisher="nkhader7"
              TargetPlatform="universal"/>
    <DisplayName>Gitleaks Scanner WASM</DisplayName>
    <Description xml:space="preserve">Scan your workspace for hardcoded secrets using the gitleaks WASM module. Results appear as diagnostics, in a dedicated panel, and in the Explorer sidebar.</Description>
    <Tags>gitleaks,secrets,security,wasm,scanner</Tags>
    <Categories>Linters,Other</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.96.0"/>
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code"/>
  </Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest"
           Path="extension/package.json"
           Addressable="true"/>
  </Assets>
</PackageManifest>
'@
[System.IO.File]::WriteAllText("$STAGE_DIR\extension.vsixmanifest", $vsixManifest, [System.Text.Encoding]::UTF8)

Write-Host "[4/4] Packaging into .vsix..."
Remove-Item $OUT_FILE -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "$STAGE_DIR\*" -DestinationPath "$OUT_FILE.zip" -Force
Move-Item "$OUT_FILE.zip" $OUT_FILE -Force
Remove-Item $STAGE_DIR -Recurse -Force

$size = [math]::Round((Get-Item $OUT_FILE).Length / 1KB, 0)
Write-Host ""
Write-Host "Done: $OUT_FILE  ($size KB)"
Write-Host ""
Write-Host "Install in Windsurf:"
Write-Host "  Ctrl+Shift+P  ->  Extensions: Install from VSIX  ->  select gitleaks-scanner-wasm.vsix"
