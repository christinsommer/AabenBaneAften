# deploy-production.ps1
$ErrorActionPreference = "Stop"

# 1. Verificer Docker-miljø (påkrævet, når Dockerfile bruges til at bygge images)
$dockerRunning = docker info 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker-motor kører ikke. Start venligst Docker Desktop først."
    exit 1
}

# 2. Verificer Cloudflare-autentificering (valgfrit, men anbefales)
# Hvis wrangler ikke er logget ind, vil deploy-kommandoen fejle
npx wrangler whoami
if ($LASTEXITCODE -ne 0) {
    Write-Error "Ikke logget ind på Cloudflare. Kør venligst npx wrangler login først."
    exit 1
}

# 3. Anvend D1-database-migrationer til produktionsmiljøet (--remote)
# Erstat "dit-database-navn" med dit faktiske D1-database-navn eller binding_name
Write-Host "Anvender D1-migrationer..." -ForegroundColor Cyan
npx wrangler d1 migrations apply aabenbaneaften --remote
if ($LASTEXITCODE -ne 0) {
    Write-Error "D1-migrationer mislykkedes. Udrulning afbrudt."
    exit 1
}

# 4. Udfør udrulning af Containers og Worker
Write-Host "Starter udrulning..." -ForegroundColor Cyan
npx wrangler deploy

# 5. Kontroller resultat
if ($LASTEXITCODE -eq 0) {
    Write-Host "Udrulning fuldført!" -ForegroundColor Green
} else {
    Write-Error "Udrulning mislykkedes. Tjek venligst logfilerne ovenfor."
    exit 1
}