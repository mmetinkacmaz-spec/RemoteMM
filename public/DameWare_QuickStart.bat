@echo off
title DameWare Agent QuickStart
echo ==========================================================
echo  DameWare Agent Auto-Installer for Virtual Machines
echo ==========================================================

:: Open Firewall Port 6129
powershell -Command "New-NetFirewallRule -DisplayName 'DameWare Agent 6129' -Direction Inbound -LocalPort 6129 -Protocol TCP -Action Allow"

echo Firewall Port 6129 opened successfully!
echo Starting DameWare Agent Service...

:: Launch Standalone Executable
if exist "DameWare_Agent.exe" (
    start DameWare_Agent.exe
) else (
    echo Launching native Windows Agent...
    powershell -Command "Invoke-WebRequest -Uri 'http://localhost:5173/DameWare_Agent.exe' -OutFile 'DameWare_Agent.exe'; Start-Process 'DameWare_Agent.exe'"
)

pause
