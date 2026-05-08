$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Index = Get-Content (Join-Path $Root "modules\index.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$ModuleMap = @{}

foreach ($Module in $Index.modules) {
  $ModuleMap["$($Module.name)@$($Module.version)"] = $Module.sha256
}

$Errors = @()
$SkillDir = Join-Path $Root "catalog\skills"
$SkillFiles = Get-ChildItem -LiteralPath $SkillDir -Filter "*.md" | Where-Object {
  $Name = $_.Name.ToLowerInvariant()
  $Name -ne "readme.md" -and
  $Name -ne "skill_template.md" -and
  -not $Name.StartsWith("_")
}

foreach ($File in $SkillFiles) {
  $Text = Get-Content -LiteralPath $File.FullName -Raw -Encoding UTF8
  $Match = [regex]::Match($Text, "(?s)^---\r?\n(.*?)\r?\n---\r?\n(.*)$")

  if (-not $Match.Success) {
    $Errors += "$($File.Name): missing frontmatter"
    continue
  }

  $Frontmatter = $Match.Groups[1].Value
  $Body = $Match.Groups[2].Value

  foreach ($Field in @("module", "sha256", "when", "args", "caps", "export")) {
    if ($Frontmatter -notmatch "(?m)^$Field\s*:") {
      $Errors += "$($File.Name): missing $Field"
    }
  }

  if ($Frontmatter -notmatch "(?m)^args:\r?\n(?:\s+[^\r\n]+\r?\n)*\s+path:\s+/workspace\s*$") {
    $Errors += "$($File.Name): missing args.path /workspace"
  }

  if ($Frontmatter -notmatch "(?m)^caps:\r?\n\s+-\s+fs:read\s*$") {
    $Errors += "$($File.Name): missing fs:read cap"
  }

  if ($Body -notmatch "(?m)^#\s+\S") {
    $Errors += "$($File.Name): missing H1 title"
  }

  $ModuleRef = [regex]::Match($Frontmatter, "(?m)^module:\s*(\S+)").Groups[1].Value
  $Sha256 = [regex]::Match($Frontmatter, "(?m)^sha256:\s*(\S+)").Groups[1].Value

  if (-not $ModuleMap.ContainsKey($ModuleRef)) {
    $Errors += "$($File.Name): unknown module $ModuleRef"
  } elseif ($ModuleMap[$ModuleRef] -ne $Sha256) {
    $Errors += "$($File.Name): sha mismatch for $ModuleRef"
  }
}

if ($Errors.Count -gt 0) {
  $Errors | ForEach-Object { Write-Error $_ }
  exit 1
}

Write-Output "validated:$($SkillFiles.Count)"
