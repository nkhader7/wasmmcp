param(
  [int]$Port = 8765,
  [string]$BindAddress = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$ProtocolVersion = "2025-06-18"
$ServerVersion = "0.3.0"

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
    if ($Line.StartsWith("# ")) { return $Line.Substring(2).Trim() }
  }
  return "Untitled Skill"
}

function Parse-Skill($Path) {
  $Text = Get-Content -LiteralPath $Path.FullName -Raw -Encoding UTF8
  $Match = [regex]::Match($Text, "(?s)^---\r?\n(.*?)\r?\n---\r?\n(.*)$")
  if (-not $Match.Success) { throw "Skill $($Path.Name) is missing frontmatter" }

  $Meta = @{}
  $Section = $null
  foreach ($Raw in ($Match.Groups[1].Value -split "`r?`n")) {
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
    title = Extract-Title $Match.Groups[2].Value
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
    $Skill = Parse-Skill $Path
    $Skills[$Skill.name] = $Skill
  }
  return $Skills
}

function List-Tools($Skills) {
  return @($Skills.Values | ForEach-Object {
    [ordered]@{
      name = $_.name
      title = $_.title
      description = "Resolve local module $($_.module)@$($_.version)"
      inputSchema = [ordered]@{
        type = "object"
        additionalProperties = $true
      }
    }
  })
}

function Resolve-ToolCall($Skills, [string]$Name, $Args) {
  if (-not $Skills.ContainsKey($Name)) { throw "Unknown skill: $Name" }

  $Skill = $Skills[$Name]
  $MergedArgs = @{}
  foreach ($Key in $Skill.args.Keys) { $MergedArgs[$Key] = $Skill.args[$Key] }
  if ($Args -ne $null) {
    foreach ($Property in $Args.PSObject.Properties) { $MergedArgs[$Property.Name] = $Property.Value }
  }

  return [ordered]@{
    content = @([ordered]@{
      type = "text"
      text = "Invoke local module $($Skill.module)@$($Skill.version)"
    })
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

function Invoke-Rpc($Request, $Skills) {
  if ($null -eq $Request.id -or $Request.method -eq "notifications/initialized") { return $null }

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
        return [ordered]@{
          jsonrpc = "2.0"
          id = $Request.id
          error = [ordered]@{ code = -32601; message = "Method not found: $($Request.method)" }
        }
      }
    }

    return [ordered]@{ jsonrpc = "2.0"; id = $Request.id; result = $Result }
  } catch {
    return [ordered]@{
      jsonrpc = "2.0"
      id = $Request.id
      error = [ordered]@{ code = -32000; message = $_.Exception.Message }
    }
  }
}

function Get-Reason([int]$Status) {
  switch ($Status) {
    200 { "OK" }
    204 { "No Content" }
    400 { "Bad Request" }
    404 { "Not Found" }
    405 { "Method Not Allowed" }
    default { "Internal Server Error" }
  }
}

function Send-HttpResponse($Stream, [int]$Status, [string]$ContentType, [string]$Body) {
  $BodyBytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
  $Headers = "HTTP/1.1 $Status $(Get-Reason $Status)`r`n" +
    "Content-Type: $ContentType`r`n" +
    "Content-Length: $($BodyBytes.Length)`r`n" +
    "Access-Control-Allow-Origin: *`r`n" +
    "Access-Control-Allow-Headers: content-type, mcp-session-id`r`n" +
    "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n" +
    "Connection: close`r`n`r`n"
  $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Headers)
  $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
  if ($BodyBytes.Length -gt 0) { $Stream.Write($BodyBytes, 0, $BodyBytes.Length) }
}

function Read-HttpRequest($Stream) {
  $Buffer = New-Object byte[] 4096
  $Memory = New-Object System.IO.MemoryStream
  $HeaderEnd = -1
  $ContentLength = 0

  while ($true) {
    $Read = $Stream.Read($Buffer, 0, $Buffer.Length)
    if ($Read -le 0) { break }
    $Memory.Write($Buffer, 0, $Read)
    $Data = $Memory.ToArray()
    $HeaderProbe = [System.Text.Encoding]::ASCII.GetString($Data)
    $HeaderEnd = $HeaderProbe.IndexOf("`r`n`r`n")
    if ($HeaderEnd -ge 0) {
      $HeaderText = $HeaderProbe.Substring(0, $HeaderEnd)
      foreach ($HeaderLine in ($HeaderText -split "`r`n")) {
        if ($HeaderLine -match "^\s*Content-Length\s*:\s*(\d+)\s*$") {
          $ContentLength = [int]$Matches[1]
        }
      }
      if ($Data.Length -ge ($HeaderEnd + 4 + $ContentLength)) { break }
    }
  }

  if ($HeaderEnd -lt 0) { throw "Invalid HTTP request" }
  $AllBytes = $Memory.ToArray()
  $HeaderString = [System.Text.Encoding]::ASCII.GetString($AllBytes, 0, $HeaderEnd)
  $Lines = $HeaderString -split "`r`n"
  $RequestLine = $Lines[0].Split(" ")
  if ($RequestLine.Count -lt 2) { throw "Invalid HTTP request line" }

  $Body = ""
  if ($ContentLength -gt 0) {
    $BodyBytes = New-Object byte[] $ContentLength
    [Array]::Copy($AllBytes, $HeaderEnd + 4, $BodyBytes, 0, $ContentLength)
    $Body = [System.Text.Encoding]::UTF8.GetString($BodyBytes)
  }

  return [ordered]@{
    method = $RequestLine[0]
    path = $RequestLine[1]
    body = $Body
  }
}

function Handle-Client($Client, $Skills) {
  $Stream = $Client.GetStream()
  try {
    $Request = Read-HttpRequest $Stream
    $PathOnly = ([string]$Request.path).Split("?")[0]

    if ($Request.method -eq "OPTIONS") {
      Send-HttpResponse $Stream 204 "text/plain" ""
      return
    }

    if ($Request.method -eq "GET" -and $PathOnly -eq "/health") {
      Send-HttpResponse $Stream 200 "application/json" '{"ok":true,"name":"wasmmcp"}'
      return
    }

    if ($Request.method -eq "GET" -and $PathOnly -eq "/mcp") {
      $Sse = "event: ready`ndata: {`"endpoint`":`"/mcp`"}`n`n"
      Send-HttpResponse $Stream 200 "text/event-stream" $Sse
      return
    }

    if ($Request.method -ne "POST" -or $PathOnly -ne "/mcp") {
      Send-HttpResponse $Stream 404 "application/json" '{"error":"not found"}'
      return
    }

    $Payload = $Request.body | ConvertFrom-Json
    if ($Payload -is [array]) {
      $Responses = @($Payload | ForEach-Object { Invoke-Rpc $_ $Skills } | Where-Object { $null -ne $_ })
      Send-HttpResponse $Stream 200 "application/json" ($Responses | ConvertTo-Json -Depth 32 -Compress)
    } else {
      $Response = Invoke-Rpc $Payload $Skills
      if ($null -eq $Response) {
        Send-HttpResponse $Stream 204 "text/plain" ""
      } else {
        Send-HttpResponse $Stream 200 "application/json" ($Response | ConvertTo-Json -Depth 32 -Compress)
      }
    }
  } catch {
    $Escaped = ($_.Exception.Message -replace "\\", "\\" -replace '"', '\"')
    Send-HttpResponse $Stream 500 "application/json" "{`"error`":`"$Escaped`"}"
  } finally {
    $Stream.Close()
  }
}

$Skills = Load-Skills
$Address = [System.Net.IPAddress]::Parse($BindAddress)
$Listener = [System.Net.Sockets.TcpListener]::new($Address, $Port)
$Listener.Start()
[Console]::Error.WriteLine("wasmmcp listening on http://$BindAddress`:$Port/mcp")

while ($true) {
  $Client = $Listener.AcceptTcpClient()
  try {
    Handle-Client $Client $Skills
  } finally {
    $Client.Close()
  }
}
