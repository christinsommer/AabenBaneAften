param([switch]$ElevatedRetry)

$ErrorActionPreference = 'Stop'

function Restart-CleanupAsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if ($ElevatedRetry -or $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Windows refused to stop the server even with administrator rights. Port 3000 must be free before startup.'
    }

    Write-Host 'Administrator rights are needed to stop the old server. Accept the Windows UAC prompt to continue.'
    try {
        # Elevate only cleanup, not npm or the new development server.
        # Rerun discovery rather than passing potentially stale process IDs.
        $cleanup = Start-Process -FilePath "$PSHOME\powershell.exe" `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ElevatedRetry" `
            -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    } catch {
        throw 'Administrator cleanup could not start or the UAC prompt was cancelled. Run npm.cmd run dev again and approve the prompt.'
    }
    if ($cleanup.ExitCode -ne 0) {
        throw 'Administrator cleanup failed. Port 3000 must be free before startup.'
    }
}

# Only terminate listeners on the explicitly reserved development port.
# Query all listeners so an empty port is not treated as a PowerShell error.
function Get-DevListener {
    @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 3000 })
}

try {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $serverPath = Join-Path $projectRoot 'node_modules\next\dist\server\lib\start-server.js'
    $oldServers = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -and $_.CommandLine.Contains($serverPath) } |
        Select-Object -ExpandProperty ProcessId)
    $owners = @(@(Get-DevListener | Select-Object -ExpandProperty OwningProcess) + $oldServers |
        Sort-Object -Unique)
    foreach ($owner in $owners) {
        if ($owner -le 4 -or $owner -eq $PID) {
            throw "Refusing to stop protected process $owner on port 3000."
        }
        Write-Host "Stopping previous server or port 3000 listener (PID $owner)..."
        # Include children, such as the local runtime of an older Next.js server.
        & taskkill.exe /PID $owner /T /F
        if ($LASTEXITCODE -ne 0 -and (Get-Process -Id $owner -ErrorAction SilentlyContinue)) {
            Restart-CleanupAsAdministrator
            break
        }
    }

    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-DevListener).Count -gt 0) {
        if ((Get-Date) -ge $deadline) {
            throw 'Port 3000 is still occupied. Startup aborted.'
        }
        Start-Sleep -Milliseconds 250
    }
    Write-Host 'Port 3000 is ready.'
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
