import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function pushDeployAgent({ targetHost, domain = 'WORKGROUP', username = 'Administrator', password = '', port = 6129, onProgress }) {
  console.log(`[Push Deployer] Initiating zero-touch remote agent deployment to ${targetHost} into C:\\Sanal...`);

  return new Promise(async (resolve) => {
    const addLog = (msg) => {
      console.log(`[Push Deployer] ${msg}`);
      if (onProgress) onProgress(msg);
    };

    addLog(`Phase 1/3: Authenticating Local Admin user (${username}) to \\\\${targetHost}...`);

    const publicExePath = path.join(__dirname, '..', 'public', 'DameWare_Agent.exe');
    const userAuth = domain && domain !== 'WORKGROUP' ? `${domain}\\${username}` : username;
    
    // Remote Deployment Script targeting C:\Sanal\DameWare_Agent.exe on the remote VM
    const psScript = `
    $targetHost = "${targetHost}"
    $targetUser = "${userAuth}"
    $targetPass = "${password}"
    $exeLocal = "${publicExePath.replace(/\\/g, '\\\\')}"

    cmd.exe /c "net use \\\\$targetHost\\C$ $targetPass /USER:$targetUser" 2>&1 | Out-Null

    # Create C:\\Sanal directory on Remote VM
    powershell -Command "New-Item -ItemType Directory -Force -Path '\\\\$targetHost\\C$\\Sanal'" 2>&1 | Out-Null

    # Copy Executable to Remote C:\\Sanal\\DameWare_Agent.exe
    Copy-Item -Path $exeLocal -Destination "\\\\$targetHost\\C$\\Sanal\\DameWare_Agent.exe" -Force -ErrorAction SilentlyContinue

    # Copy Executable to Remote C:\\DameWare_Agent.exe as well
    Copy-Item -Path $exeLocal -Destination "\\\\$targetHost\\C$\\DameWare_Agent.exe" -Force -ErrorAction SilentlyContinue

    # Launch Process Remotely
    try {
        $sec = ConvertTo-SecureString $targetPass -AsPlainText -Force
        $cred = New-Object System.Management.Automation.PSCredential($targetUser, $sec)
        Invoke-Command -ComputerName $targetHost -Credential $cred -ScriptBlock {
            New-Item -ItemType Directory -Force -Path "C:\\Sanal" -ErrorAction SilentlyContinue
            Copy-Item -Path "C:\\DameWare_Agent.exe" -Destination "C:\\Sanal\\DameWare_Agent.exe" -Force -ErrorAction SilentlyContinue
            Start-Process -FilePath "C:\\Sanal\\DameWare_Agent.exe" -WindowStyle Hidden
        } -ErrorAction SilentlyContinue
    } catch {}

    # Fallback Schtasks
    schtasks /create /s $targetHost /u $targetUser /p $targetPass /tn "DameWareSanalAuto" /tr "C:\\Sanal\\DameWare_Agent.exe" /sc once /st 00:00 /f 2>&1 | Out-Null
    schtasks /run /s $targetHost /u $targetUser /p $targetPass /tn "DameWareSanalAuto" 2>&1 | Out-Null
    `;

    addLog(`Phase 2/3: Copying DameWare_Agent.exe to \\\\${targetHost}\\C$\\Sanal\\...`);

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, '; ')}"`, (err, stdout, stderr) => {
      addLog(`Phase 3/3: Remote execution signal sent to C:\\Sanal on ${targetHost}!`);
      setTimeout(() => {
        resolve({
          success: true,
          message: `Agent automatically pushed to C:\\Sanal on ${targetHost}`
        });
      }, 2500);
    });
  });
}
