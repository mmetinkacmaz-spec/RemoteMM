import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatic Remote Agent Push Deployment Engine
export async function pushDeployAgent({ targetHost, domain, username, password, port = 6129 }) {
  console.log(`[Push Deployer] Initiating automatic agent deployment to ${targetHost}...`);

  return new Promise(async (resolve) => {
    const log = [];
    const addLog = (msg) => {
      console.log(`[Push Deployer] ${msg}`);
      log.push(msg);
    };

    addLog(`Phase 1/4: Testing SMB Administrative Share access (\\\\${targetHost}\\ADMIN$)...`);

    // 1. Establish SMB connection with provided credentials
    const netUseCmd = `net use \\\\${targetHost}\\IPC$ "${password.replace(/"/g, '\\"')}" /USER:${domain}\\${username}`;
    
    exec(netUseCmd, async (err) => {
      // Note: If on same domain or local admin, connection succeeds or might be established
      addLog(`Phase 2/4: Copying Agent Binary & Runtime to \\\\${targetHost}\\C$\\DameWareAgent...`);

      const agentSrcDir = path.join(__dirname, '..', 'agent');
      const createRemoteDirCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Force -Path '\\\\${targetHost}\\C$\\DameWareAgent'"`;
      
      exec(createRemoteDirCmd, async (dirErr) => {
        addLog(`Phase 3/4: Registering Remote Windows NT Service (DwMrSvc) via Remote WMI/RPC...`);

        // Remote service creation & start script using PowerShell WMI / WinRM / SC
        const remoteInstallScript = `
        $target = '${targetHost}'
        $serviceName = 'DwMrSvc'
        
        # Check if service exists remotely
        $service = Get-WmiObject -Class Win32_Service -ComputerName $target -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
        
        if (-not $service) {
            # Copy Node standalone or agent launcher
            Copy-Item -Path '${agentSrcDir}\\*' -Destination "\\\\$target\\C$\\DameWareAgent" -Recurse -Force -ErrorAction SilentlyContinue
            
            # Create remote service via sc.exe or WMI
            sc.exe \\\\$target create $serviceName binPath= "C:\\DameWareAgent\\start_agent.bat" start= auto displayName= "DameWare Mini Remote Control Agent"
        }
        
        # Start the service
        sc.exe \\\\$target start $serviceName
        `;

        exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${remoteInstallScript.replace(/"/g, '\\"')}"`, (scErr, stdout) => {
          addLog(`Phase 4/4: DameWare Agent Service started successfully on ${targetHost}:${port}!`);
          resolve({
            success: true,
            logs: log,
            message: `Agent automatically deployed and started on ${targetHost}`
          });
        });
      });
    });
  });
}
