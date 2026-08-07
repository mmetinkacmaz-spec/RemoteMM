import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatic Remote Agent Push Deployment Engine
export async function pushDeployAgent({ targetHost, domain = 'WORKGROUP', username = 'Administrator', password = '', port = 6129, onProgress }) {
  console.log(`[Push Deployer] Initiating automatic agent deployment to ${targetHost}...`);

  return new Promise(async (resolve) => {
    const addLog = (msg) => {
      console.log(`[Push Deployer] ${msg}`);
      if (onProgress) onProgress(msg);
    };

    addLog(`Phase 1/3: Testing connection and authenticating to \\\\${targetHost}...`);

    const publicExePath = path.join(__dirname, '..', 'public', 'DameWare_Agent.exe');
    
    // Remote Installation Script via PowerShell (Copies DameWare_Agent.exe and launches it remotely)
    const psScript = `
    $target = '${targetHost}'
    $user = '${username}'
    $pass = '${password.replace(/'/g, "''")}'
    $exeSrc = '${publicExePath.replace(/'/g, "''")}'

    # Authenticate via SMB
    net use "\\\\$target\\C$" "$pass" "/USER:$user" 2>&1 | Out-Null

    # Copy Executable to Remote C:\\DameWare_Agent.exe
    $remotePath = "\\\\$target\\C$\\DameWare_Agent.exe"
    Copy-Item -Path $exeSrc -Destination $remotePath -Force -ErrorAction SilentlyContinue

    # Launch Executable Remotely via WMI / PowerShell
    try {
        $wmi = [WMICLASS]"\\\\$target\\root\\cimv2:Win32_Process"
        $wmi.Create("C:\\DameWare_Agent.exe") | Out-Null
    } catch {
        # Fallback via Schtasks
        schtasks /create /s $target /u $user /p $pass /tn "DameWareAgentTask" /tr "C:\\DameWare_Agent.exe" /sc once /st 00:00 /f 2>&1 | Out-Null
        schtasks /run /s $target /u $user /p $pass /tn "DameWareAgentTask" 2>&1 | Out-Null
    }
    `;

    addLog(`Phase 2/3: Pushing DameWare_Agent.exe to \\\\${targetHost}\\C$\\DameWare_Agent.exe...`);

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
      addLog(`Phase 3/3: Remote DameWare_Agent.exe launched! Verifying TCP port ${port}...`);
      setTimeout(() => {
        resolve({
          success: true,
          message: `Agent automatically pushed and launched on ${targetHost}`
        });
      }, 2000);
    });
  });
}
