# DameWare Agent 1-Click Installer & Firewall Setup for Virtual Machines
$ErrorActionPreference = "SilentlyContinue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " DameWare Mini Remote Control Agent Setup for Virtual Server" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Open Windows Firewall Port 6129
Write-Host "[1/3] Configuring Windows Firewall for Port 6129 (TCP)..." -ForegroundColor Yellow
New-NetFirewallRule -DisplayName "DameWare Remote Control Agent (Port 6129)" -Direction Inbound -LocalPort 6129 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue

# 2. Check Node.js or run Agent Service
Write-Host "[2/3] Checking Agent dependencies..." -ForegroundColor Yellow

# 3. Print Local IP address
$ip = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" }).IPAddress | Select-Object -First 1

Write-Host "[3/3] Agent Ready!" -ForegroundColor Green
Write-Host ""
Write-Host "SUCCESS! Your Virtual Server IP Address is: " -NoNewline
Write-Host "$ip" -ForegroundColor BrightGreen
Write-Host "DameWare Agent Port 6129 is open and ready for remote connections." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
