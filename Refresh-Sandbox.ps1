[CmdletBinding(SupportsShouldProcess = $true)]
param([switch]$PrepareOnly)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = [IO.Path]::GetFullPath($PSScriptRoot)
Set-Location -LiteralPath $root

function Assert-LocalPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe workspace path: $full" }
    $cursor = $full
    while ($cursor -and $cursor.Length -ge $root.Length) {
        if (Test-Path -LiteralPath $cursor) {
            if ((Get-Item -Force -LiteralPath $cursor).LinkType -in @('Junction','SymbolicLink')) { throw "Refusing linked directory/file: $cursor" }
        }
        $cursor = [IO.Path]::GetDirectoryName($cursor)
    }
    return $full
}
function Invoke-Node([string[]]$NodeArgs) {
    & $script:node @NodeArgs
    if ($LASTEXITCODE -ne 0) { throw "Node command failed (exit $LASTEXITCODE). Sandbox has not been activated." }
}
function Assert-DevStopped {
    $running = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -in @('node.exe','workerd.exe') -and $_.CommandLine -and
        $_.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $_.CommandLine -match '(next.*\bdev\b|start-server\.js|wrangler.*\b(dev|preview)\b|workerd)'
    })
    if ($running.Count) { throw 'Stop the local development server (Ctrl+C) before refreshing Sandbox, then run this script again.' }
}
function Set-LocalSetting([string]$Text, [string]$Key, [string]$Value) {
    $pattern = '(?m)^\s*' + [regex]::Escape($Key) + '\s*=.*$'
    $Text = [regex]::Replace($Text, $pattern, '')
    return $Text.TrimEnd() + "`r`n$Key=`"$Value`"`r`n"
}

$state = Assert-LocalPath (Join-Path $root '.data/sandbox-refresh')
if (Test-Path -LiteralPath (Join-Path $state 'paused')) { Write-Host 'Sandbox refresh paused (.data/sandbox-refresh/paused exists).'; return }
if (-not $PSCmdlet.ShouldProcess('Local Sandbox', 'Export Production read-only, sanitize and verify copy; optionally replace local data')) { return }
$node = (Get-Command node.exe -ErrorAction Stop).Source
if (-not (Test-Path 'node_modules/wrangler/bin/wrangler.js')) { throw 'Install project dependencies first (npm.cmd ci).' }
Assert-DevStopped
$null = New-Item -ItemType Directory -Force -Path $state
$lockPath = Assert-LocalPath (Join-Path $root '.data/full-deploy.lock')
$lock = $null
$temp = $null
$oldCI = $env:CI
$run = Assert-LocalPath (Join-Path $state ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N')))
$stage = Assert-LocalPath (Join-Path $run 'prepared')
$live = Assert-LocalPath (Join-Path $root '.wrangler/local-dev')
$vars = Assert-LocalPath (Join-Path $root '.dev.vars')
$oldDatabaseMoved = $false
$newDatabaseMoved = $false
$varsChanged = $false
try {
    $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    if (Test-Path '.data/releases/release.lock') { throw 'A release lock exists. Finish the deployment first.' }
    $null = New-Item -ItemType Directory -Path $run
    # The raw production export is outside the OneDrive project and removed in finally.
    $temp = Join-Path ([IO.Path]::GetTempPath()) ('aabenbane-export-' + [guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $temp
    $sql = Join-Path $temp 'production.sql'
    $env:CI = '1'
    Invoke-Node @('node_modules/wrangler/bin/wrangler.js','d1','export','DB','--remote','--config','wrangler.jsonc',"--output=$sql")
    Invoke-Node @('scripts/sandbox-copy.mjs',$sql,$stage,(Join-Path $run 'verification.json'))
    if ($PrepareOnly) { Write-Host "Prepared and verified only. Sandbox unchanged. Report: $run"; return }
    Assert-DevStopped
    $report = Get-Content -Raw -LiteralPath (Join-Path $run 'verification.json') | ConvertFrom-Json
    $hadVars = Test-Path -LiteralPath $vars
    $text = ''
    if ($hadVars) {
        Copy-Item -LiteralPath $vars -Destination (Join-Path $run 'dev.vars.before')
        $text = [IO.File]::ReadAllText($vars)
    }
    $text = Set-LocalSetting $text 'RESEND_API_KEY' ''
    $text = Set-LocalSetting $text 'NEWSLETTER_ENABLED' 'false'
    $text = Set-LocalSetting $text 'SUPERADMIN_PLAYER_ID' ([string]$report.adminId)
    $text = Set-LocalSetting $text 'OPTIMIZER_URL' 'http://127.0.0.1:5117'
    if ($text -notmatch '(?m)^\s*MFA_ENCRYPTION_KEY\s*=\s*["'']?[a-fA-F0-9]{64}["'']?\s*$') {
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $text = Set-LocalSetting $text 'MFA_ENCRYPTION_KEY' ([BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant())
    }
    [IO.File]::WriteAllText((Join-Path $run 'dev.vars.prepared'), $text, (New-Object Text.UTF8Encoding($false)))
    # Keep the entire stopped local state, including SQLite WAL files, as the backup.
    if (Test-Path -LiteralPath $live) {
        $null = Assert-LocalPath $live
        Move-Item -LiteralPath $live -Destination (Join-Path $run 'local-dev.before')
        $oldDatabaseMoved = $true
    }
    $null = New-Item -ItemType Directory -Force -Path (Split-Path $live)
    $null = Assert-LocalPath $stage
    Move-Item -LiteralPath $stage -Destination $live
    $newDatabaseMoved = $true
    $varsChanged = $true
    Copy-Item -LiteralPath (Join-Path $run 'dev.vars.prepared') -Destination $vars -Force
    Write-Host "Sandbox refreshed. Backup and report: $run"
    Write-Host 'Mail is disabled. Test accounts: 90000001 (Super Admin), 90000002 (member). PINs: .data/sandbox-refresh/test-logins.json'
    Write-Host 'Start Sandbox with npm.cmd run dev. Admin requires a new local 2FA setup.'
} catch {
    if ($newDatabaseMoved) {
        $null = Assert-LocalPath $live
        Move-Item -LiteralPath $live -Destination (Join-Path $run 'failed-activation')
    }
    if ($oldDatabaseMoved) {
        $backup = Assert-LocalPath (Join-Path $run 'local-dev.before')
        Move-Item -LiteralPath $backup -Destination $live
    }
    if ($varsChanged) {
        if ($hadVars) { Copy-Item -LiteralPath (Join-Path $run 'dev.vars.before') -Destination $vars -Force }
        else { Remove-Item -LiteralPath $vars -ErrorAction SilentlyContinue }
    }
    throw
} finally {
    $env:CI = $oldCI
    if ($temp) {
        $resolvedTemp = [IO.Path]::GetFullPath($temp)
        $expectedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
        if ([IO.Path]::GetDirectoryName($resolvedTemp) -eq $expectedParent -and [IO.Path]::GetFileName($resolvedTemp) -like 'aabenbane-export-*') {
            Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
        }
    }
    if ($lock) { $lock.Dispose() }
}
