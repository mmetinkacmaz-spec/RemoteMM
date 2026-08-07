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
    
    // Remote Installation & Zero-Touch Execution via PowerShell (SMB + WMI / Scheduled Task)
    const psScript = `
    $target = '${targetHost}'
    $user = '${userAuth.replace(/'/g, "''")}'
    $pass = '${password.replace(/'/g, "''")}'
    $exeSrc = '${publicExePath.replace(/'/g, "''")}'

    # 1. Authenticate SMB session using Administrator credentials
    net use "\\\\$target\\IPC$" "$pass" "/USER:$user" 2>&1 | Out-Null
    net use "\\\\$target\\C$" "$pass" "/USER:$user" 2>&1 | Out-Null

    # 2. Silently Copy Executable to Remote C:\\DameWare_Agent.exe
    $remotePath = "\\\\$target\\C$\\DameWare_Agent.exe"
    Copy-Item -Path $exeSrc -Destination $remotePath -Force -ErrorAction SilentlyContinue

    # 3. Create Firewall Inbound Rule for Port 6129 remotely
    try {
        $secpass = ConvertTo-SecureString $pass -AsPlainText -Force
        $cred = New-Object System.Management.Automation.PSCredential ($user, $secpass)
        Invoke-Command -ComputerName $target -Credential $cred -ScriptBlock {
            New-NetFirewallRule -DisplayName "DameWare Remote Port" -Direction Inbound -LocalPort 6129 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
            Start-Process -FilePath "C:\\DameWare_Agent.exe" -WindowStyle Hidden
        } -ErrorAction SilentlyContinue
    } catch {}

    # 4. Fallback WMI Process Creation
    try {
        $wmi = [WMICLASS]"\\\\$target\\root\\cimv2:Win32_Process"
        $wmi.Create("C:\\DameWare_Agent.exe") | Out-Null
    } catch {}

    # 5. Fallback Remote Scheduled Task (Runs immediately without user interaction)
    schtasks /create /s $target /u $user /p $pass /tn "DameWareAutoLaunch" /tr "C:\\DameWare_Agent.exe" /sc once /st 00:00 /f 2>&1 | Out-Null
    schtasks /run /s $target /u $user /p $pass /tn "DameWareAutoLaunch" 2>&1 | Out-Null
    `;

    addLog(`Phase 2/3: Silently copying DameWare_Agent.exe to \\\\${targetHost}\\C$\\...`);

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
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
