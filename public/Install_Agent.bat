@echo off
title DameWare Agent Installer & Setup Script
color 0A
echo ==========================================================
echo   DameWare Mini Remote Control Agent Setup (.BAT)
echo ==========================================================
echo.

echo [1/3] Enabling Windows UAC Secure Desktop Bypass Registry Policy...
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v PromptOnSecureDesktop /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Lsa" /v LimitBlankPasswordUse /t REG_DWORD /d 0 /f >nul 2>&1

echo [2/3] Adding Windows Firewall Inbound Exception for TCP Port 6129...
netsh advfirewall firewall delete rule name="DameWare Remote Port" >nul 2>&1
netsh advfirewall firewall add rule name="DameWare Remote Port" dir=in action=allow protocol=TCP localport=6129 >nul 2>&1
powershell -Command "Set-NetFirewallRule -DisplayGroup 'Dosya ve Yazıcı Paylaşımı' -Enabled True -ErrorAction SilentlyContinue" >nul 2>&1

echo [3/3] Launching DameWare High-Speed Agent Executable...
if exist "%~dp0DameWare_Agent.exe" (
    start "" "%~dp0DameWare_Agent.exe"
    echo [+] DameWare_Agent.exe started successfully!
) else if exist "C:\Sanal\DameWare_Agent.exe" (
    start "" "C:\Sanal\DameWare_Agent.exe"
    echo [+] C:\Sanal\DameWare_Agent.exe started successfully!
) else (
    echo [-] DameWare_Agent.exe not found in local path.
)

echo.
echo ==========================================================
echo Setup Completed Successfully!
echo ==========================================================
pause
