$ErrorActionPreference = 'Stop'

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
            throw "Could not stop process $owner. Port 3000 must be free before startup."
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
    Write-Error $_
    exit 1
}
