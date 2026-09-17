# Run from any directory: powershell -ExecutionPolicy Bypass -File "path\to\Deploy.ps1"
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$CheckOnly,
    [ValidateRange(1, 60)][int]$ContainerWaitMinutes = 15
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
# Handle native exit codes explicitly, including expected rollout-check failures.
if (Test-Path Variable:PSNativeCommandUseErrorActionPreference) { $PSNativeCommandUseErrorActionPreference = $false }
if (-not $PSCmdlet.ShouldProcess('https://aabenbaneaften.dk', $(if ($CheckOnly) { 'Run local release checks' } else { 'Deploy optimizer and website' }))) { return }

$projectRoot = $PSScriptRoot
$originalPath = $env:PATH
$restartDev = $false
$deployLock = $null
$exitCode = 0

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable $($Arguments -join ' ') failed (exit $LASTEXITCODE). Deployment stopped." }
}

function Stop-ProjectDevServer {
    # Follow only this project's Next.js process tree, never unrelated Node processes.
    $processes = @(Get-CimInstance Win32_Process)
    $servers = @($processes | Where-Object {
        $_.Name -eq 'node.exe' -and $_.CommandLine -and
        $_.CommandLine.IndexOf($projectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $_.CommandLine -match 'next[\\/]dist[\\/]server[\\/]lib[\\/]start-server\.js'
    })
    $ids = [Collections.Generic.HashSet[int]]::new()
    foreach ($server in $servers) {
        $parent = $processes | Where-Object { $_.ProcessId -eq $server.ParentProcessId } | Select-Object -First 1
        if ($parent -and $parent.Name -eq 'node.exe' -and $parent.CommandLine -match 'next.*\bdev\b') {
            [void]$ids.Add([int]$server.ProcessId)
            [void]$ids.Add([int]$parent.ProcessId)
        }
    }
    if (-not $ids.Count) { return }
    $script:restartDev = $true
    do {
        $previousCount = $ids.Count
        foreach ($process in $processes) {
            if ($ids.Contains([int]$process.ParentProcessId)) { [void]$ids.Add([int]$process.ProcessId) }
        }
    } while ($ids.Count -gt $previousCount)
    Write-Host 'Stopping the local development server temporarily to release build files.'
    foreach ($processId in $ids) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }
}

Push-Location -LiteralPath $projectRoot
try {
    [void](Get-Command node.exe -ErrorAction Stop)
    [void](Get-Command dotnet.exe -ErrorAction Stop)
    if (-not (Test-Path -LiteralPath 'node_modules/wrangler/bin/wrangler.js')) {
        throw 'Dependencies are missing. Run npm ci in the project directory first.'
    }
    [void][IO.Directory]::CreateDirectory((Join-Path $projectRoot '.data'))
    $deployLock = [IO.File]::Open((Join-Path $projectRoot '.data/full-deploy.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)

    if (-not $CheckOnly) {
        $dockerCommand = Get-Command docker.exe -ErrorAction SilentlyContinue
        if (-not $dockerCommand) {
            foreach ($bin in @((Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin'), 'C:/Program Files/Docker/Docker/resources/bin')) {
                if (Test-Path -LiteralPath (Join-Path $bin 'docker.exe')) { $env:PATH = "$bin;$env:PATH"; break }
            }
        }
        [void](Get-Command docker.exe -ErrorAction Stop)
        $dockerOS = & docker.exe info --format '{{.OSType}}'
        if ($LASTEXITCODE -ne 0 -or $dockerOS -ne 'linux') { throw 'Start Docker Desktop with Linux containers, then retry.' }
        Invoke-Checked 'node.exe' @('node_modules/wrangler/bin/wrangler.js', 'whoami')
    }

    Stop-ProjectDevServer
    if ($CheckOnly) {
        Invoke-Checked 'node.exe' @('scripts/release.mjs', '--check')
        Write-Host 'Local checks passed. Production was not changed.' -ForegroundColor Green
    } else {
        # Catch solver regressions before changing the live container.
        Invoke-Checked 'node.exe' @('scripts/optimizer-service.mjs', 'test')
        Invoke-Checked 'node.exe' @('scripts/optimizer-cloudflare.mjs', 'deploy')
        $deadline = [DateTime]::UtcNow.AddMinutes($ContainerWaitMinutes)
        do {
            & node.exe scripts/optimizer-cloudflare.mjs check
            if ($LASTEXITCODE -eq 0) { break }
            if ([DateTime]::UtcNow -ge $deadline) { throw 'The new optimizer did not pass verification in time. Website deployment was not started.' }
            Write-Host 'Waiting 30 seconds for the new Cloudflare container version...'
            Start-Sleep -Seconds 30
        } while ($true)

        # Reuses the existing secret and verifies the optimizer before connecting it.
        Invoke-Checked 'node.exe' @('scripts/optimizer-cloudflare.mjs', 'connect')
        # Build, full tests, verified D1 backup, migrations, deploy and release health check.
        Invoke-Checked 'node.exe' @('scripts/release.mjs')
        Invoke-Checked 'node.exe' @('scripts/optimizer-cloudflare.mjs', 'check')
        Write-Host 'Deployment completed and verified: https://aabenbaneaften.dk' -ForegroundColor Green
        Write-Host 'Database backup and receipt: .data/releases/'
    }
} catch {
    $exitCode = 1
    Write-Host "DEPLOY FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Any completed production steps remain applied. No automatic rollback was performed.'
} finally {
    if ($restartDev) {
        try {
            [void][IO.Directory]::CreateDirectory((Join-Path $projectRoot 'work'))
            $devProcess = Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList 'node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3000' -WorkingDirectory $projectRoot -RedirectStandardOutput (Join-Path $projectRoot 'work/next-dev.out.log') -RedirectStandardError (Join-Path $projectRoot 'work/next-dev.err.log') -PassThru
            Write-Host "Local development server restarted (PID $($devProcess.Id))."
        } catch { Write-Warning "Could not restart the local development server: $($_.Exception.Message)" }
    }
    if ($deployLock) { $deployLock.Dispose() }
    $env:PATH = $originalPath
    Pop-Location
}
exit $exitCode
