# DameWare Mini Remote Control - Windows System Service Installer
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Installing DameWare Agent as Windows SYSTEM Service..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$agentPath = "$PSScriptRoot\DameWare_Agent.exe"

# 1. Enable Windows SoftwareSASGeneration Policy for Ctrl+Alt+Del
Set-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" -Name "SoftwareSASGeneration" -Value 3 -Type DWord -ErrorAction SilentlyContinue

# 2. Stop and remove existing service if present
sc.exe stop DameWareAgent | Out-Null
sc.exe delete DameWareAgent | Out-Null

# 3. Create Windows SYSTEM Service (Runs under LocalSystem for UAC & Winlogon access)
sc.exe create DameWareAgent binPath= "$agentPath" start= auto obj= "LocalSystem" displayName= "DameWare Mini Remote Control Service v12.2"

# 4. Start DameWare Service
sc.exe start DameWareAgent

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[+] DameWare Service installed and started successfully!" -ForegroundColor Green
Write-Host "[+] Lock screens (Winlogon) & UAC prompts are now fully captured." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
