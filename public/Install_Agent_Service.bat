@echo off
:: DameWare Mini Remote Control - System Service Installer Batch
color 0A
echo ==========================================================
echo  DameWare Agent - Registering as SYSTEM Windows Service...
echo ==========================================================

:: 1. Self-install using built-in -install flag
"%~dp0DameWare_Agent.exe" -install

echo.
echo ==========================================================
echo  DameWare SYSTEM Service Installation Complete!
echo  Lock screens (Winlogon) and UAC prompts are now fully captured.
echo ==========================================================
pause
