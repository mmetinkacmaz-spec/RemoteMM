@echo off
netsh advfirewall firewall delete rule name=RemoteMMAgent >nul 2>&1
netsh advfirewall firewall add rule name=RemoteMMAgent dir=in action=allow protocol=TCP localport=6129
schtasks /create /tn "RemoteMMAgent" /tr ""C:\Program Files\RemoteMM\RemoteMM_Agent.exe"" /sc onstart /ru SYSTEM /rl HIGHEST /f
schtasks /run /tn "RemoteMMAgent"