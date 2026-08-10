<#
  DELTA_FLOW_TOWER_INTEGRATION_VERSION=1.0.1

  Windows launcher for the Delta Flow VS Code extension.

  Tower (or `git difftool`) invokes it with the two temp trees:
      delta-flow.ps1 <LOCAL> <REMOTE>
  We open a VS Code window whose folder settings carry the two paths, then
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

function Resolve-RevisionLabel([string]$Repo, [string]$Revision) {
  $refs = @(& git -C $Repo for-each-ref "--points-at=$Revision" '--format=%(refname)' `
    refs/heads refs/tags refs/remotes 2>$null)
  foreach ($ref in $refs) {
    if ($ref.StartsWith('refs/heads/')) { return $ref.Substring(11) }
  }
  foreach ($ref in $refs) {
    if ($ref.StartsWith('refs/tags/')) { return $ref.Substring(10) }
    if ($ref.StartsWith('refs/remotes/') -and -not $ref.EndsWith('/HEAD')) {
      return $ref.Substring(13)
    }
  }
  return (& git -C $Repo rev-parse --short=8 $Revision 2>$null)
}

function Add-Revision(
  [string]$Repo,
  [string]$Candidate,
  [System.Collections.Generic.List[string]]$Revisions
) {
  $candidate = $Candidate.Trim(@([char]39, [char]34))
  $resolved = & git -C $Repo rev-parse --verify --quiet "${candidate}^{commit}" 2>$null
  if ($LASTEXITCODE -eq 0 -and $resolved -and -not $Revisions.Contains($resolved)) {
    $Revisions.Add($resolved)
  }
}

# Tower formally supplies only the two snapshot directories. When its Git
# parent process contains both revisions, resolve them to friendly ref names.
function Get-InferredWorkspaceName {
  $repo = if ($env:GIT_WORK_TREE) { $env:GIT_WORK_TREE } else { (Get-Location).Path }
  & git -C $repo rev-parse --git-dir 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { return 'session' }

  $revisions = [System.Collections.Generic.List[string]]::new()
  $ancestorId = $PID
  for ($count = 0; $count -lt 8 -and $ancestorId -gt 1 -and $revisions.Count -lt 2; $count++) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ancestorId" -ErrorAction SilentlyContinue
    if (-not $process) { break }
    $command = $process.CommandLine
    if ($command -like '*difftool*' -and $command -notlike '*difftool--helper*') {
      foreach ($match in [regex]::Matches($command, "[^\s`"']+")) {
        $token = $match.Value
        if ($token -match '^(.+?)\.{3}(.+)$') {
          Add-Revision $repo $Matches[1] $revisions
          Add-Revision $repo $Matches[2] $revisions
        } elseif ($token -match '^(.+?)\.{2}(.+)$') {
          Add-Revision $repo $Matches[1] $revisions
          Add-Revision $repo $Matches[2] $revisions
        } else {
          Add-Revision $repo $token $revisions
        }
        if ($revisions.Count -ge 2) { break }
      }
    }
    $ancestorId = $process.ParentProcessId
  }

  if ($revisions.Count -ge 2) {
    $left = Resolve-RevisionLabel $repo $revisions[0]
    $right = Resolve-RevisionLabel $repo $revisions[1]
    return "$left ↔ $right"
  }
  $root = & git -C $repo rev-parse --show-toplevel 2>$null
  if ($LASTEXITCODE -eq 0 -and $root) {
    return 'Delta Flow - ' + (Split-Path $root -Leaf)
  }
  return 'session'
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

# A named empty folder anchors the window. Using a folder rather than a
# .code-workspace file avoids VS Code's automatic "(Workspace)" suffix. It lives
# under a stable, per-user sessions root the user can trust once; VS Code then
# inherits that trust for every session and suppresses the Restricted Mode
# banner. Only the sessions\ child is meant to be trusted, keeping any siblings
# out of scope. %LOCALAPPDATA% gives a readable, conventional path (not roamed,
# unlike %APPDATA%) that the user can recognise when trusting it.
$base = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE 'AppData\Local' }
$sessions = Join-Path $base 'delta-flow\sessions'
New-Item -ItemType Directory -Path $sessions -Force | Out-Null

# Remove session anchors left behind by crashed or force-quit windows. The
# 3-day floor mirrors the OS temp reaping we used to rely on.
Get-ChildItem -LiteralPath $sessions -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-3) } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

$scratch = Join-Path $sessions ([System.IO.Path]::GetRandomFileName())
New-Item -ItemType Directory -Path $scratch | Out-Null
try {
  $workspaceName = if ($env:DELTA_FLOW_WORKSPACE_NAME) {
    $env:DELTA_FLOW_WORKSPACE_NAME
  } else {
    Get-InferredWorkspaceName
  }
  foreach ($invalid in [System.IO.Path]::GetInvalidFileNameChars()) {
    $workspaceName = $workspaceName.Replace($invalid, '-')
  }
  $workdir = Join-Path $scratch $workspaceName
  $settingsDir = Join-Path $workdir '.vscode'
  New-Item -ItemType Directory -Path $settingsDir | Out-Null
  $config = [ordered]@{
    'deltaFlow.session'              = [ordered]@{ left = $localFull; right = $remoteFull }
    'workbench.startupEditor'        = 'none'
    'explorer.openEditors.visible'   = 0
    'workbench.editor.enablePreview' = $true
    'files.exclude'                  = [ordered]@{ '.vscode' = $true; '.delta-flow' = $true }
  }
  $settings = Join-Path $settingsDir 'settings.json'
  $config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $settings -Encoding UTF8

  # Marker that scopes the extension's activationEvents to Delta Flow windows only.
  New-Item -ItemType File -Path (Join-Path $workdir '.delta-flow') | Out-Null

  & $code --new-window --wait $workdir
}
finally {
  Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
}
