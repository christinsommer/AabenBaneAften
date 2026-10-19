# Generated build output only. Use native Windows deletion for OneDrive directory entries.
[CmdletBinding()]
param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectRoot).ProviderPath.TrimEnd('\', '/')
foreach ($name in @('.next', '.open-next')) {
    $target = [IO.Path]::GetFullPath((Join-Path $root $name))
    if ([IO.Path]::GetDirectoryName($target) -ne $root) {
        throw "Build cleanup target is outside the project: $target"
    }
    if (-not (Test-Path -LiteralPath $target)) { continue }
    $item = Get-Item -LiteralPath $target -Force
    if (-not $item.PSIsContainer -or $item.LinkType -in @('SymbolicLink', 'Junction')) {
        throw "Build cleanup refuses a file or directory link: $target"
    }
    for ($attempt = 1; $attempt -le 5; $attempt++) {
        try {
            Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
            break
        } catch {
            if ($attempt -eq 5) {
                throw "Cannot clear generated build output '$target'. Close processes using this folder and pause OneDrive sync, then retry. $($_.Exception.Message)"
            }
            Start-Sleep -Milliseconds (500 * $attempt)
        }
    }
    Write-Host "Cleared generated build output: $name"
}
