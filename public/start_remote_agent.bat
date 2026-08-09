@echo off
title RemoteMM Agent - SYSTEM Service Installer
color 0A
echo =====================================================
echo  RemoteMM Agent v2.0 - NT SYSTEM Service Installer
echo =====================================================
echo.

:: Yonetici yetkisi gerekli
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Bu script Yonetici olarak calistirilmalidir!
    pause
    exit /b 1
)

:: 1. UAC Secure Desktop kapatma - UAC pencerelerini yakalamayi saglar
echo [1/5] UAC Secure Desktop politikasi devre disi birakilıyor...
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v PromptOnSecureDesktop /t REG_DWORD /d 0 /f >nul 2>&1

:: 2. Firewall portu ac
echo [2/5] TCP 6129 portu aciliyor...
netsh advfirewall firewall delete rule name="RemoteMM Agent" >nul 2>&1
netsh advfirewall firewall add rule name="RemoteMM Agent" dir=in action=allow protocol=TCP localport=6129 >nul 2>&1

:: 3. Hedef dizin olustur
echo [3/5] Kurulum dizini olusturuluyor...
if not exist "C:\Program Files\RemoteMM" mkdir "C:\Program Files\RemoteMM"

:: 4. EXE'yi kopyala
echo [4/5] RemoteMM_Agent.exe kopyalaniyor...
if exist "%~dp0RemoteMM_Agent.exe" (
    copy /Y "%~dp0RemoteMM_Agent.exe" "C:\Program Files\RemoteMM\RemoteMM_Agent.exe" >nul 2>&1
) else if exist "C:\Sanal\RemoteMM_Agent.exe" (
    copy /Y "C:\Sanal\RemoteMM_Agent.exe" "C:\Program Files\RemoteMM\RemoteMM_Agent.exe" >nul 2>&1
) else if exist "%~dp0DameWare_Agent.exe" (
    :: Eski ajan - normal olarak calistir
    echo [!] RemoteMM_Agent.exe bulunamadi, eski agent kullaniliyor...
    taskkill /IM DameWare_Agent.exe /F >nul 2>&1
    copy /Y "%~dp0DameWare_Agent.exe" "C:\Sanal\DameWare_Agent.exe" >nul 2>&1
    start "" "C:\Sanal\DameWare_Agent.exe"
    goto :done
)

:: 5. Windows NT Servis olarak kaydet ve baslat
echo [5/5] NT SYSTEM Servis olarak kaydediliyor...
sc stop RemoteMMAgent >nul 2>&1
sc delete RemoteMMAgent >nul 2>&1
timeout /t 1 /nobreak >nul

sc create RemoteMMAgent binPath= "\"C:\Program Files\RemoteMM\RemoteMM_Agent.exe\"" start= auto DisplayName= "RemoteMM Remote Control Agent" obj= "LocalSystem" >nul 2>&1
sc description RemoteMMAgent "RemoteMM uzak masaustu erisim servisi. TCP 6129." >nul 2>&1
sc start RemoteMMAgent >nul 2>&1

timeout /t 2 /nobreak >nul
sc query RemoteMMAgent | find "RUNNING" >nul 2>&1
if %errorLevel% equ 0 (
    echo.
    echo =====================================================
    echo  [+] RemoteMM Agent SYSTEM Servisi BASARIYLA KURULDU
    echo      Servis: RemoteMMAgent
    echo      Port: 6129
    echo      Yetki: NT AUTHORITY\SYSTEM
    echo      UAC pencerelerine tam erisim: AKTIF
    echo =====================================================
) else (
    echo.
    echo [!] Servis baslatma hatasi. Manuel kontrol edin:
    echo     sc query RemoteMMAgent
)

:done
echo.
pause

