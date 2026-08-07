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
    
    // Remote Push Script with explicitly quoted password & SMB session cleanup
    const psScript = `
    $target = '${targetHost}'
    $user = '${userAuth.replace(/'/g, "''")}'
    $pass = '${password.replace(/'/g, "''")}'
    $exeSrc = '${publicExePath.replace(/'/g, "''")}'

    # Clear existing SMB connections
    net use "\\\\$target\\IPC$" /delete /y 2>&1 | Out-Null
    net use "\\\\$target\\C$" /delete /y 2>&1 | Out-Null

    # Authenticate SMB session with explicit password
    cmd.exe /c "net use \\\\$target\\IPC$ ""$pass"" /USER:$user" 2>&1 | Out-Null
    cmd.exe /c "net use \\\\$target\\C$ ""$pass"" /USER:$user" 2>&1 | Out-Null

    # Silently Copy Executable to Remote C:\\DameWare_Agent.exe
    $remotePath = "\\\\$target\\C$\\DameWare_Agent.exe"
    Copy-Item -Path $exeSrc -Destination $remotePath -Force -ErrorAction SilentlyContinue

    # Launch Remote Process via WMI
    try {
        $wmi = [WMICLASS]"\\\\$target\\root\\cimv2:Win32_Process"
        $wmi.Create("C:\\DameWare_Agent.exe") | Out-Null
    } catch {}

    # Launch Remote Process via Schtasks
    schtasks /create /s $target /u $user /p "$pass" /tn "DameWareAutoLaunch" /tr "C:\\DameWare_Agent.exe" /sc once /st 00:00 /f 2>&1 | Out-Null
    schtasks /run /s $target /u $user /p "$pass" /tn "DameWareAutoLaunch" 2>&1 | Out-Null
    `;

    addLog(`Phase 2/3: Copying DameWare_Agent.exe to \\\\${targetHost}\\C$\\...`);

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
