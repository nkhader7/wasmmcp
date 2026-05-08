$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$ProtocolVersion = "2025-06-18"
$ServerVersion = "0.3.0"

function Write-JsonRpc($Message) {
  [Console]::Out.WriteLine(($Message | ConvertTo-Json -Depth 32 -Compress))
  [Console]::Out.Flush()
}

function Parse-Scalar([string]$Value) {
  $Value = $Value.Trim()
  if ($Value -eq "true") { return $true }
  if ($Value -eq "false") { return $false }
  if ($Value -match "^-?\d+$") { return [int]$Value }
  if ($Value.StartsWith('"') -and $Value.EndsWith('"')) {
    return $Value.Substring(1, $Value.Length - 2)
  }
  return $Value
}

function Extract-Title([string]$Body) {
  foreach ($Line in ($Body -split "`r?`n")) {
    if ($Line.StartsWith("# ")) {
      return $Line.Substring(2).Trim()
    }
  }
  return "Untitled Skill"
}

function Parse-Skill($Path) {
  $Text = Get-Content -LiteralPath $Path.FullName -Raw -Encoding UTF8
  $Match = [regex]::Match($Text, "(?s)^---\r?\n(.*?)\r?\n---\r?\n(.*)$")
  if (-not $Match.Success) {
    throw "Skill $($Path.Name) is missing frontmatter"
  }

  $Frontmatter = $Match.Groups[1].Value
  $Body = $Match.Groups[2].Value
  $Meta = @{}
  $Section = $null

  foreach ($Raw in ($Frontmatter -split "`r?`n")) {
    if ([string]::IsNullOrWhiteSpace($Raw)) { continue }
    $Line = $Raw.Trim()

    if ($Line.StartsWith("- ")) {
      if ($Section -eq $null -or -not ($Meta[$Section] -is [System.Collections.IList])) {
        throw "Unexpected list item: $Line"
      }
      $Meta[$Section].Add((Parse-Scalar $Line.Substring(2))) | Out-Null
      continue
    }

    if ($Raw.StartsWith(" ") -and $Section -ne $null -and $Meta[$Section] -is [hashtable]) {
      $Parts = $Line.Split(":", 2)
      if ($Parts.Count -ne 2) { throw "Invalid frontmatter line: $Line" }
      $Meta[$Section][$Parts[0].Trim()] = Parse-Scalar $Parts[1]
      continue
    }

    $Section = $null
    $Top = $Line.Split(":", 2)
    if ($Top.Count -ne 2) { throw "Invalid frontmatter line: $Line" }

    $Key = $Top[0].Trim()
    $Value = $Top[1].Trim()
    if ($Value.Length -gt 0) {
      $Meta[$Key] = Parse-Scalar $Value
    } elseif ($Key -eq "caps") {
      $Meta[$Key] = [System.Collections.ArrayList]::new()
      $Section = $Key
    } else {
      $Meta[$Key] = @{}
      $Section = $Key
    }
  }

  $ModuleParts = [string]$Meta["module"] -split "@", 2
  if ($ModuleParts.Count -ne 2) {
    throw "Skill $($Path.Name) must reference module as name@version"
  }

  return [ordered]@{
    name = [System.IO.Path]::GetFileNameWithoutExtension($Path.Name)
    title = Extract-Title $Body
    description = [string]$Meta["description"]
    module = $ModuleParts[0]
    version = $ModuleParts[1]
    sha256 = [string]$Meta["sha256"]
    when = @(([string]$Meta["when"] -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ }))
    args = $Meta["args"]
    caps = @($Meta["caps"])
    exportName = [string]$Meta["export"]
  }
}

function Load-Skills {
  $Skills = @{}
  $SkillsDir = Join-Path $Root "catalog\skills"
  foreach ($Path in Get-ChildItem -LiteralPath $SkillsDir -Filter "*.md" | Sort-Object Name) {
    if (-not (Test-SkillFile $Path.Name)) { continue }
    $Skill = Parse-Skill $Path
    $Skills[$Skill.name] = $Skill
  }
  return $Skills
}

function Test-SkillFile([string]$Name) {
  $Normalized = $Name.ToLowerInvariant()
  return (
    $Normalized.EndsWith(".md") -and
    $Normalized -ne "readme.md" -and
    $Normalized -ne "skill_template.md" -and
    -not $Normalized.StartsWith("_")
  )
}

function List-Tools($Skills) {
  return @($Skills.Values | ForEach-Object {
    [ordered]@{
      name = $_.name
      title = $_.title
      description = if ($_.description) { $_.description } else { "Resolve local module $($_.module)@$($_.version)" }
      inputSchema = [ordered]@{
        type = "object"
        additionalProperties = $true
      }
    }
  })
}

function Resolve-ToolCall($Skills, [string]$Name, $Args) {
  if (-not $Skills.ContainsKey($Name)) {
    throw "Unknown skill: $Name"
  }

  $Skill = $Skills[$Name]
  $MergedArgs = @{}
  foreach ($Key in $Skill.args.Keys) { $MergedArgs[$Key] = $Skill.args[$Key] }
  if ($Args -ne $null) {
    foreach ($Property in $Args.PSObject.Properties) { $MergedArgs[$Property.Name] = $Property.Value }
  }

  return [ordered]@{
    content = @(
      [ordered]@{
        type = "text"
        text = "Invoke local module $($Skill.module)@$($Skill.version)"
      }
    )
    _meta = [ordered]@{
      invokeLocal = [ordered]@{
        module = "$($Skill.module)@$($Skill.version)"
        version = $Skill.version
        sha256 = $Skill.sha256
        export = $Skill.exportName
        args = $MergedArgs
        caps = @($Skill.caps)
      }
    }
  }
}

$Skills = Load-Skills

while ($true) {
  $Line = [Console]::In.ReadLine()
  if ($null -eq $Line) { break }
  if ([string]::IsNullOrWhiteSpace($Line)) { continue }

  try {
    $Request = $Line | ConvertFrom-Json
  } catch {
    Write-JsonRpc ([ordered]@{
      jsonrpc = "2.0"
      id = $null
      error = [ordered]@{ code = -32700; message = "Parse error" }
    })
    continue
  }

  if ($null -eq $Request.id -or $Request.method -eq "notifications/initialized") {
    continue
  }

  try {
    switch ($Request.method) {
      "initialize" {
        $Result = [ordered]@{
          protocolVersion = $ProtocolVersion
          serverInfo = [ordered]@{ name = "wasmmcp-dispatcher"; version = $ServerVersion }
          capabilities = [ordered]@{ tools = [ordered]@{ listChanged = $true } }
        }
      }
      "tools/list" {
        $Result = [ordered]@{ tools = List-Tools $Skills }
      }
      "tools/call" {
        if (-not $Request.params.name) { throw "params.name is required" }
        $Result = Resolve-ToolCall $Skills $Request.params.name $Request.params.arguments
        if ($Request.params._meta.progressToken) {
          $Result._meta["progressToken"] = $Request.params._meta.progressToken
        }
      }
      { $_ -in @("resources/read", "resources/list") } {
        $Result = [ordered]@{ resources = @() }
      }
      default {
        Write-JsonRpc ([ordered]@{
          jsonrpc = "2.0"
          id = $Request.id
          error = [ordered]@{ code = -32601; message = "Method not found: $($Request.method)" }
        })
        continue
      }
    }

    Write-JsonRpc ([ordered]@{ jsonrpc = "2.0"; id = $Request.id; result = $Result })
  } catch {
    Write-JsonRpc ([ordered]@{
      jsonrpc = "2.0"
      id = $Request.id
      error = [ordered]@{ code = -32000; message = $_.Exception.Message }
    })
  }
}
