<#
  Windows launcher for the Delta Flow VS Code extension.

  Tower (or `git difftool`) invokes it with the two temp trees:
      delta-flow.ps1 <LOCAL> <REMOTE>
  We open a VS Code window whose workspace settings carry the two paths, then
  block (via --wait) until the user closes it, so the caller keeps the temp
  trees alive.

  Set $env:DELTA_FLOW_CODE to override the VS Code CLI location.
#>
param(
  [Parameter(Mandatory = $true)][string]$Local,
  [Parameter(Mandatory = $true)][string]$Remote
)

$ErrorActionPreference = 'Stop'

# Tower and other GUI clients run with a minimal PATH, so probe known locations.
function Find-Code {
  $candidates = @(
    $env:DELTA_FLOW_CODE,
    'code',
    (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd'),
    (Join-Path $env:ProgramFiles 'Microsoft VS Code\bin\code.cmd'),
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft VS Code\bin\code.cmd')
  )
  foreach ($candidate in $candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
    $found = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($found) { return $found.Source }
  }
  throw 'could not find the VS Code CLI; set DELTA_FLOW_CODE'
}

$code = Find-Code
$localFull = (Resolve-Path -LiteralPath $Local).Path
$remoteFull = (Resolve-Path -LiteralPath $Remote).Path

$bothDirs = (Test-Path -LiteralPath $localFull -PathType Container) -and
            (Test-Path -LiteralPath $remoteFull -PathType Container)

# Without a directory changeset, the caller invokes us per file: fall back to a
# plain diff so this launcher is safe to use as a generic diff tool too.
if (-not $bothDirs) {
  & $code --diff --wait $localFull $remoteFull
  exit $LASTEXITCODE
}

# An empty scratch folder anchors the workspace so --wait reliably holds the
# window open; the diff paths ride in the workspace settings.
$workdir = Join-Path ([System.IO.Path]::GetTempPath()) ('delta-flow-' + [System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $workdir | Out-Null
try {
  $config = [ordered]@{
    folders  = @(@{ path = '.'; name = 'Delta Flow' })
    settings = [ordered]@{
      'deltaFlow.session'              = [ordered]@{ left = $localFull; right = $remoteFull }
      'workbench.startupEditor'        = 'none'
      'explorer.openEditors.visible'   = 0
      'workbench.editor.enablePreview' = $true
      'files.exclude'                  = [ordered]@{ 'session.code-workspace' = $true; '.delta-flow' = $true }
    }
  }
  $workspace = Join-Path $workdir 'session.code-workspace'
  $config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $workspace -Encoding UTF8

  # Marker that scopes the extension's activationEvents to Delta Flow windows only.
  New-Item -ItemType File -Path (Join-Path $workdir '.delta-flow') | Out-Null

  & $code --new-window --wait $workspace
}
finally {
  Remove-Item -LiteralPath $workdir -Recurse -Force -ErrorAction SilentlyContinue
}
