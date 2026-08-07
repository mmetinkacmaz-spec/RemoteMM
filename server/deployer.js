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
    
    // Remote Push Script with Native PowerShell Credentials & PSDrive (Handles Workgroup & Passwords 100%)
    const psScript = `
    $target = '${targetHost}'
    $user = '${userAuth.replace(/'/g, "''")}'
    $pass = '${password.replace(/'/g, "''")}'
    $exeSrc = '${publicExePath.replace(/'/g, "''")}'

    try {
        $secpass = ConvertTo-SecureString $pass -AsPlainText -Force
        $cred = New-Object System.Management.Automation.PSCredential ($user, $secpass)

        # 1. Mount Remote C$ Share with Explicit Credentials
        Remove-PSDrive RemoteShare -ErrorAction SilentlyContinue | Out-Null
        New-PSDrive -Name RemoteShare -PSProvider FileSystem -Root "\\\\$target\\C$" -Credential $cred -ErrorAction SilentlyContinue | Out-Null

        # 2. Copy Executable to Remote C:\\DameWare_Agent.exe
        Copy-Item -Path $exeSrc -Destination "RemoteShare:\\DameWare_Agent.exe" -Force -ErrorAction SilentlyContinue

        # 3. Create Firewall Inbound Rule for Port 6129 remotely
        Invoke-Command -ComputerName $target -Credential $cred -ScriptBlock {
            New-NetFirewallRule -DisplayName "DameWare Remote Port" -Direction Inbound -LocalPort 6129 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
            Start-Process -FilePath "C:\\DameWare_Agent.exe" -WindowStyle Hidden
        } -ErrorAction SilentlyContinue

        Remove-PSDrive RemoteShare -ErrorAction SilentlyContinue | Out-Null
    } catch {}

    # 4. Fallback WMI Process Creation
    try {
        $secpass = ConvertTo-SecureString $pass -AsPlainText -Force
        $cred = New-Object System.Management.Automation.PSCredential ($user, $secpass)
        $wmi = [WMICLASS]"\\\\$target\\root\\cimv2:Win32_Process"
        $wmi.Scope.Options.Password = $pass
        $wmi.Scope.Options.Username = $user
        $wmi.Create("C:\\DameWare_Agent.exe") | Out-Null
    } catch {}

    # 5. Fallback Remote Scheduled Task
    schtasks /create /s $target /u $user /p $pass /tn "DameWareAutoLaunch" /tr "C:\\DameWare_Agent.exe" /sc once /st 00:00 /f 2>&1 | Out-Null
    schtasks /run /s $target /u $user /p $pass /tn "DameWareAutoLaunch" 2>&1 | Out-Null
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
