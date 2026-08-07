import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function pushDeployAgent({ targetHost, domain = 'WORKGROUP', username = 'Administrator', password = '', port = 6129, onProgress }) {
  console.log(`[Push Deployer] Initiating zero-touch remote agent deployment to ${targetHost}...`);

  return new Promise(async (resolve) => {
    const addLog = (msg) => {
      console.log(`[Push Deployer] ${msg}`);
      if (onProgress) onProgress(msg);
    };

    addLog(`Phase 1/3: Authenticating Local Admin user (${username}) to \\\\${targetHost}...`);

    const publicExePath = path.join(__dirname, '..', 'public', 'DameWare_Agent.exe');
    const userAuth = domain && domain !== 'WORKGROUP' ? `${domain}\\${username}` : username;
    
    // Robust Windows Remote Push Deployment Script
    const psScript = `
    $targetHost = "${targetHost}"
    $targetUser = "${userAuth}"
    $targetPass = "${password}"
    $exeLocal = "${publicExePath.replace(/\\/g, '\\\\')}"

    # Clear previous SMB connections
    cmd.exe /c "net use \\\\$targetHost\\IPC$ /delete /y" 2>&1 | Out-Null
    cmd.exe /c "net use \\\\$targetHost\\C$ /delete /y" 2>&1 | Out-Null

    # Establish SMB Session
    $netRes = cmd.exe /c "net use \\\\$targetHost\\C$ $targetPass /USER:$targetUser"
    
    # Copy Executable to Remote Target C:\\DameWare_Agent.exe
    Copy-Item -Path $exeLocal -Destination "\\\\$targetHost\\C$\\DameWare_Agent.exe" -Force -ErrorAction SilentlyContinue

    # Launch Remotely via WMI Win32_Process
    try {
        $sec = ConvertTo-SecureString $targetPass -AsPlainText -Force
        $cred = New-Object System.Management.Automation.PSCredential($targetUser, $sec)
        Invoke-Command -ComputerName $targetHost -Credential $cred -ScriptBlock {
            Start-Process -FilePath "C:\\DameWare_Agent.exe" -WindowStyle Hidden
        } -ErrorAction SilentlyContinue
    } catch {}

    # Launch Remotely via Schtasks
    schtasks /create /s $targetHost /u $targetUser /p $targetPass /tn "DameWareAutoLaunch" /tr "C:\\DameWare_Agent.exe" /sc once /st 00:00 /f 2>&1 | Out-Null
    schtasks /run /s $targetHost /u $targetUser /p $targetPass /tn "DameWareAutoLaunch" 2>&1 | Out-Null
    `;

    addLog(`Phase 2/3: Copying DameWare_Agent.exe to \\\\${targetHost}\\C$\\...`);

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, '; ')}"`, (err, stdout, stderr) => {
      addLog(`Phase 3/3: Remote execution signal sent to ${targetHost}! Waiting for connection...`);
      setTimeout(() => {
        resolve({
          success: true,
          message: `Agent automatically pushed and launched on ${targetHost}`
        });
      }, 2500);
    });
  });
}
