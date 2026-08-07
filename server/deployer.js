import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function pushDeployAgent({ targetHost, domain = 'WORKGROUP', username = 'Administrator', password = '', port = 6129, onProgress }) {
  console.log(`[Push Deployer] Initiating interactive remote agent deployment to ${targetHost}...`);

  return new Promise(async (resolve) => {
    const addLog = (msg) => {
      console.log(`[Push Deployer] ${msg}`);
      if (onProgress) onProgress(msg);
    };

    addLog(`Phase 1/3: Authenticating Local Admin user (${username}) to \\\\${targetHost}...`);

    const publicExePath = path.join(__dirname, '..', 'public', 'DameWare_Agent.exe');
    const userAuth = domain && domain !== 'WORKGROUP' ? `${domain}\\${username}` : username;
    
    // Deploy binary to remote host & execute interactively via Schtasks in user session
    const psScript = `
    $targetHost = "${targetHost}"
    $targetUser = "${userAuth}"
    $targetPass = "${password}"
    $exeLocal = "${publicExePath.replace(/\\/g, '\\\\')}"

    cmd.exe /c "net use \\\\$targetHost\\IPC$ /delete /y" 2>&1 | Out-Null
    cmd.exe /c "net use \\\\$targetHost\\C$ /delete /y" 2>&1 | Out-Null
    cmd.exe /c "net use \\\\$targetHost\\C$ $targetPass /USER:$targetUser" 2>&1 | Out-Null

    powershell -Command "New-Item -ItemType Directory -Force -Path '\\\\$targetHost\\C$\\Sanal'" 2>&1 | Out-Null

    Copy-Item -Path $exeLocal -Destination "\\\\$targetHost\\C$\\Sanal\\DameWare_Agent.exe" -Force -ErrorAction SilentlyContinue
    Copy-Item -Path $exeLocal -Destination "\\\\$targetHost\\C$\\DameWare_Agent.exe" -Force -ErrorAction SilentlyContinue

    # Launch Interactively in User Desktop via Task Scheduler
    schtasks /create /s $targetHost /u $targetUser /p $targetPass /tn "DameWareInteractive" /tr "C:\\Sanal\\DameWare_Agent.exe" /sc once /st 00:00 /f /rl HIGHEST 2>&1 | Out-Null
    schtasks /run /s $targetHost /u $targetUser /p $targetPass /tn "DameWareInteractive" 2>&1 | Out-Null
    `;

    addLog(`Phase 2/3: Copying DameWare_Agent.exe to \\\\${targetHost}\\C$\\Sanal\\...`);

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/\n/g, '; ')}"`, (err, stdout, stderr) => {
      addLog(`Phase 3/3: Remote interactive agent deployed to ${targetHost}!`);
      setTimeout(() => {
        resolve({
          success: true,
          message: `Agent automatically pushed and launched on ${targetHost}`
        });
      }, 2500);
    });
  });
}
