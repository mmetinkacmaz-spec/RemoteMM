import { exec } from 'child_process';
exec(`schtasks /create /s 172.31.132.183 /u "makine1" /p "123456" /tn "RemoteMMTest2" /tr "cmd.exe" /sc ONSTART /f`, (e, out, err) => {
    console.log("ERR:", e);
    console.log("OUT:", out);
    console.log("STD:", err);
});
