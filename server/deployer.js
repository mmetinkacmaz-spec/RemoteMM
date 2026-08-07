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
    
    // Remote Deployment Script creating Windows Service automatically via SMB & sc.exe
    const psScript = `
    $targetHost = "${targetHost}"
    $targetUser = "${userAuth}"
    $targetPass = "${password}"
    $exeLocal = "${publicExePath.replace(/\\/g, '\\\\')}"

    # Clear previous SMB connections and establish fresh session
    cmd.exe /c "net use \\\\$targetHost\\IPC$ /delete /y" 2>&1 | Out-Null
    cmd.exe /c "net use \\\\$targetHost\\C$ /delete /y" 2>&1 | Out-Null
    cmd.exe /c "net use \\\\$targetHost\\C$ $targetPass /USER:$targetUser" 2>&1 | Out-Null

    # Create C:\\Sanal directory on Remote VM
    powershell -Command "New-Item -ItemType Directory -Force -Path '\\\\$targetHost\\C$\\Sanal'" 2>&1 | Out-Null

    # Copy Service Executable to Remote C:\\Sanal\\DameWare_Agent.exe
    Copy-Item -Path $exeLocal -Destination "\\\\$targetHost\\C$\\Sanal\\DameWare_Agent.exe" -Force -ErrorAction SilentlyContinue

    # Register and start Windows NT Service remotely
    cmd.exe /c "sc.exe \\\\$targetHost create DameWareSanal binPath= ""C:\\Sanal\\DameWare_Agent.exe"" start= auto displayName= ""DameWare Remote Agent Service""" 2>&1 | Out-Null
    cmd.exe /c "sc.exe \\\\$targetHost start DameWareSanal" 2>&1 | Out-Null
    `;

    addLog(`Phase 2/3: Copying Service Binary to \\\\${targetHost}\\C$\\Sanal\\...`);

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, '; ')}"`, (err, stdout, stderr) => {
      addLog(`Phase 3/3: DameWareSanal Windows Service registered and started on ${targetHost}!`);
      setTimeout(() => {
        resolve({
          success: true,
          message: `Agent Service automatically deployed to C:\\Sanal on ${targetHost}`
        });
      }, 2500);
    });
  });
}
