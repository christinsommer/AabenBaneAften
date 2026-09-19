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
$restartOptimizer = $false
$deployLock = $null
$exitCode = 0
$transcribing = $false

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    $stepTimer = [Diagnostics.Stopwatch]::StartNew()
    Write-Host "Starting: $Executable $($Arguments -join ' ')" -ForegroundColor Cyan
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable $($Arguments -join ' ') failed (exit $LASTEXITCODE). Deployment stopped." }
    Write-Host "Completed in $([int]$stepTimer.Elapsed.TotalSeconds) seconds." -ForegroundColor Green
}

function Stop-ProjectOptimizer {
    $dll = [IO.Path]::GetFullPath((Join-Path $projectRoot 'optimizer-service/bin/Debug/net10.0/OptimizerService.dll'))
    $candidates = @(Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'dotnet.exe' -and $_.CommandLine -match 'OptimizerService\.dll'
    })
    foreach ($candidate in $candidates) {
        # The command may contain a relative path. Check the actual loaded DLL.
        $process = Get-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue
        if (-not $process) { continue }
        $ownsDll = @($process.Modules | Where-Object { $_.FileName -eq $dll }).Count -gt 0
        if (-not $ownsDll) { continue }
        if ($candidate.CommandLine -notmatch '--urls\s+http://127\.0\.0\.1:5117\b') {
            throw 'Another process is using the optimizer build. Stop its test or custom service before deploying.'
        }
        $script:restartOptimizer = $true
        Write-Host 'Stopping the local optimizer temporarily to release its DLL.'
        Stop-Process -Id $process.Id -Force
        if (-not $process.WaitForExit(10000)) { throw 'The local optimizer did not stop in time.' }
    }
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
    $logPath = Join-Path $projectRoot ('.data/deploy-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
    Start-Transcript -Path $logPath | Out-Null
    $transcribing = $true
    Write-Host "Deployment log: $logPath"
    Write-Host 'The OpenNext Windows warning is informational. Release steps report progress every 30 seconds and time out after 15 minutes.'

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
    Stop-ProjectOptimizer
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
    if ($restartOptimizer) {
        try {
            [void][IO.Directory]::CreateDirectory((Join-Path $projectRoot 'work'))
            $optimizerProcess = Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList 'scripts/optimizer-service.mjs','start' -WorkingDirectory $projectRoot -RedirectStandardOutput (Join-Path $projectRoot 'work/optimizer-restarted.out.log') -RedirectStandardError (Join-Path $projectRoot 'work/optimizer-restarted.err.log') -PassThru
            Write-Host "Local optimizer restarted (PID $($optimizerProcess.Id))."
        } catch { Write-Warning "Could not restart the local optimizer: $($_.Exception.Message)" }
    }
    if ($restartDev) {
        try {
            [void][IO.Directory]::CreateDirectory((Join-Path $projectRoot 'work'))
            $devProcess = Start-Process -WindowStyle Hidden -FilePath 'node.exe' -ArgumentList 'node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3000' -WorkingDirectory $projectRoot -RedirectStandardOutput (Join-Path $projectRoot 'work/next-dev.out.log') -RedirectStandardError (Join-Path $projectRoot 'work/next-dev.err.log') -PassThru
            Write-Host "Local development server restarted (PID $($devProcess.Id))."
        } catch { Write-Warning "Could not restart the local development server: $($_.Exception.Message)" }
    }
    if ($deployLock) { $deployLock.Dispose() }
    if ($transcribing) { Stop-Transcript | Out-Null }
    $env:PATH = $originalPath
    Pop-Location
}
exit $exitCode
