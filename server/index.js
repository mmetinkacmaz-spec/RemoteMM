import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { pushDeployAgent } from './deployer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.use(express.json());
// EXE ve diger public dosyalari HTTP ile sun
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'DameWare Console Gateway', port: PORT });
});

export function getBestLocalIp(targetHost = '') {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const alias of list) {
      if (alias.family === 'IPv4' && !alias.internal) {
        candidates.push({ name, ip: alias.address });
      }
    }
  }
  if (candidates.length === 0) return '127.0.0.1';

  if (targetHost && targetHost !== '127.0.0.1' && targetHost !== 'localhost') {
    const parts = targetHost.split('.');
    if (parts.length === 4) {
      const prefix = `${parts[0]}.${parts[1]}.`;
      const match = candidates.find(c => c.ip.startsWith(prefix));
      if (match) return match.ip;
    }
  }
  return candidates[0].ip;
}

// Uzak makine icin kurulum komutu uret
app.get('/api/setup-command', (req, res) => {
  const port = req.query.port || 6129;
  const targetHost = req.query.target || '';
  const localIp = getBestLocalIp(targetHost);

  const downloadUrl = `http://${localIp}:3001/RemoteMM_Agent.exe`;
  const innerCmd = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; New-Item C:\\RemoteMM -ItemType Directory -Force | Out-Null; Stop-Process -Name RemoteMM_Agent -Force -ErrorAction SilentlyContinue; Invoke-WebRequest '${downloadUrl}' -OutFile C:\\RemoteMM\\RemoteMM_Agent.exe -UseBasicParsing; netsh advfirewall firewall add rule name=RemoteMMAgent dir=in action=allow protocol=TCP localport=${port} 2>&1 | Out-Null; schtasks /delete /tn RemoteMMAgent /f 2>&1 | Out-Null; schtasks /create /tn RemoteMMAgent /tr 'C:\\RemoteMM\\RemoteMM_Agent.exe' /ru 'SYSTEM' /sc ONSTART /rl HIGHEST /f; schtasks /run /tn RemoteMMAgent`;
  const cmd = `powershell -ExecutionPolicy Bypass -Command "${innerCmd}"`;

  res.json({ cmd, downloadUrl, serverIp: localIp });
});

app.post('/api/agent/deploy', async (req, res) => {
  const { targetHost, domain, username, password, port } = req.body;
  try {
    const result = await pushDeployAgent({ targetHost, domain, username, password, port });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.replace('/?', ''));
  const targetHost = params.get('host') || '127.0.0.1';
  const targetPort = parseInt(params.get('port') || '6129', 10);
  const domain = params.get('domain') || 'WORKGROUP';
  const username = params.get('username') || 'Administrator';
  const password = params.get('password') || '';

  console.log(`[Gateway] Initiating session to ${targetHost}:${targetPort}...`);

  let isConnected = false;
  let isCancelled = false;
  let hasAttemptedPush = false;
  let tcpClient = new net.Socket();
  let buffer = '';

  const tryConnect = () => {
    if (isCancelled) return;

    buffer = ''; // Always start with a clean buffer
    if (tcpClient && !tcpClient.destroyed) {
      try { tcpClient.destroy(); } catch (e) {}
    }
    tcpClient = new net.Socket();
    tcpClient.setTimeout(3500);

    tcpClient.connect(targetPort, targetHost, () => {
      if (isCancelled) {
        tcpClient.destroy();
        return;
      }
      isConnected = true;
      console.log(`[Gateway] Connected directly to Agent on ${targetHost}:${targetPort}`);
    });

    tcpClient.on('data', (chunk) => {
      if (isCancelled) return;
      buffer += chunk.toString('utf8');

      if (buffer.length > 500000) {
        console.warn('[Gateway] Buffer exceeded 500KB, clearing corrupted stream');
        buffer = '';
        return;
      }

      let lines = buffer.split('\n');
      buffer = lines.pop();

      for (let line of lines) {
        line = line.trim();
        if (line && ws.readyState === WebSocket.OPEN && !isCancelled) {
          ws.send(line);
        }
      }
    });

    tcpClient.on('timeout', handleConnectionFailure);
    tcpClient.on('error', handleConnectionFailure);

    tcpClient.on('close', () => {
      buffer = '';
      if (isCancelled || ws.readyState !== WebSocket.OPEN) return;
      
      console.log(`[Gateway] Agent TCP connection closed (session switch or restart). Reconnecting to ${targetHost}:${targetPort}...`);
      sendProgressToConsole(ws, 'Oturum geçişi algılandı (Giriş yapılıyor...), masaüstüne bağlanılıyor...');
      
      let retryCount = 0;
      const retryInterval = setInterval(() => {
        if (isCancelled || ws.readyState !== WebSocket.OPEN) {
          clearInterval(retryInterval);
          return;
        }
        retryCount++;
        const testSock = new net.Socket();
        testSock.connect(targetPort, targetHost, () => {
          testSock.destroy();
          clearInterval(retryInterval);
          console.log(`[Gateway] Agent in new session is active! Resuming TCP session...`);
          tryConnect();
        });
        testSock.on('error', () => {
          testSock.destroy();
          if (retryCount >= 15) {
            clearInterval(retryInterval);
            if (ws.readyState === WebSocket.OPEN) ws.close();
          }
        });
      }, 600);
    });
  };

  const handleConnectionFailure = async (err) => {
    if (isConnected || isCancelled) return;
    tcpClient.destroy();

    // AUTOMATIC AGENT PUSH DEPLOYMENT IF PORT IS CLOSED & NOT YET ATTEMPTED
    if (!hasAttemptedPush) {
      hasAttemptedPush = true;
      console.log(`[Gateway] Agent port ${targetPort} unreachable on ${targetHost}. Launching Automatic Remote Push Deployment...`);

      sendProgressToConsole(ws, `Agent port ${targetPort} closed. Automatically pushing and launching DameWare_Agent.exe on ${targetHost}...`);

      try {
        await pushDeployAgent({
          targetHost,
          domain,
          username,
          password,
          port: targetPort,
          onProgress: (msg) => sendProgressToConsole(ws, msg)
        });

        console.log(`[Gateway] Push Deployment completed. Retrying direct TCP connection to ${targetHost}:${targetPort}...`);
        sendProgressToConsole(ws, `Agent launched! Connecting to remote screen...`);

        setTimeout(() => {
          if (!isCancelled) tryConnect();
        }, 1500);
        return;
      } catch (deployErr) {
        console.log(`[Gateway] Push Deployment notice: ${deployErr.message}`);
      }
    }

    // If already attempted push or push failed, return crisp error
    let code = 'ERR_CONNECTION_FAILED';
    if (err && err.code === 'ECONNREFUSED') code = 'ERR_CONNECTION_REFUSED';
    if (err && err.code === 'ENOTFOUND') code = 'ERR_HOST_NOT_FOUND';
    if (err && err.code === 'ETIMEDOUT') code = 'ERR_CONNECTION_TIMED_OUT';

    sendErrorToConsole(ws, code, `Unable to connect to ${targetHost}:${targetPort}. Verify target IP and Firewall port 6129.`);
  };

  ws.on('message', (message) => {
    if (isConnected && tcpClient.writable && !isCancelled) {
      tcpClient.write(message.toString() + '\n');
    }
  });

  ws.onclose = () => {
    isCancelled = true;
    tcpClient.destroy();
  };

  // Start initial probe
  tryConnect();
});

function sendProgressToConsole(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'DEPLOYMENT_PROGRESS',
      message,
      timestamp: Date.now()
    }));
  }
}

function sendErrorToConsole(ws, errorCode, errorMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'CONNECTION_ERROR',
      errorCode,
      errorMessage,
      timestamp: Date.now()
    }));
  }
}

server.listen(PORT, () => {
  console.log(`[Gateway Server] DameWare Console Gateway listening on port ${PORT}`);
});
